/*
Copyright 2015, 2016 OpenMarket Ltd
Copyright 2019, 2020 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { MatrixClient } from "matrix-js-sdk/src/client";
import { Room } from "matrix-js-sdk/src/models/room";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";
import { EventType, RoomCreateTypeField, RoomType } from "matrix-js-sdk/src/@types/event";
import { ICreateRoomOpts } from "matrix-js-sdk/src/@types/requests";
import {
    HistoryVisibility,
    JoinRule,
    Preset,
    RestrictedAllowType,
    Visibility,
} from "matrix-js-sdk/src/@types/partials";

import { MatrixClientPeg } from './MatrixClientPeg';
import Modal from './Modal';
import { _t } from './languageHandler';
import dis from "./dispatcher/dispatcher";
import * as Rooms from "./Rooms";
import DMRoomMap from "./utils/DMRoomMap";
import { getAddressType } from "./UserAddress";
import { getE2EEWellKnown } from "./utils/WellKnownUtils";
import GroupStore from "./stores/GroupStore";
import CountlyAnalytics from "./CountlyAnalytics";
import { isJoinedOrNearlyJoined } from "./utils/membership";
import { VIRTUAL_ROOM_EVENT_TYPE } from "./CallHandler";
import SpaceStore from "./stores/spaces/SpaceStore";
import { makeSpaceParentEvent } from "./utils/space";
import { Action } from "./dispatcher/actions";
import ErrorDialog from "./components/views/dialogs/ErrorDialog";
import Spinner from "./components/views/elements/Spinner";

import { logger } from "matrix-js-sdk/src/logger";

// we define a number of interfaces which take their names from the js-sdk
/* eslint-disable camelcase */

export interface IOpts {
    dmUserId?: string;
    createOpts?: ICreateRoomOpts;
    spinner?: boolean;
    guestAccess?: boolean;
    encryption?: boolean;
    inlineErrors?: boolean;
    andView?: boolean;
    associatedWithCommunity?: string;
    avatar?: File | string; // will upload if given file, else mxcUrl is needed
    roomType?: RoomType | string;
    historyVisibility?: HistoryVisibility;
    parentSpace?: Room;
    // contextually only makes sense if parentSpace is specified, if true then will be added to parentSpace as suggested
    suggested?: boolean;
    joinRule?: JoinRule;
}

/**
 * Create a new room, and switch to it.
 *
 * @param {object=} opts parameters for creating the room
 * @param {string=} opts.dmUserId If specified, make this a DM room for this user and invite them
 * @param {object=} opts.createOpts set of options to pass to createRoom call.
 * @param {bool=} opts.spinner True to show a modal spinner while the room is created.
 *     Default: True
 * @param {bool=} opts.guestAccess Whether to enable guest access.
 *     Default: True
 * @param {bool=} opts.encryption Whether to enable encryption.
 *     Default: False
 * @param {bool=} opts.inlineErrors True to raise errors off the promise instead of resolving to null.
 *     Default: False
 * @param {bool=} opts.andView True to dispatch an action to view the room once it has been created.
 *
 * @returns {Promise} which resolves to the room id, or null if the
 * action was aborted or failed.
 */
export default async function createRoom(opts: IOpts): Promise<string | null> {
    opts = opts || {};
    if (opts.spinner === undefined) opts.spinner = true;
    if (opts.guestAccess === undefined) opts.guestAccess = true;
    if (opts.encryption === undefined) opts.encryption = false;

    const startTime = CountlyAnalytics.getTimestamp();

    const client = MatrixClientPeg.get();
    if (client.isGuest()) {
        dis.dispatch({ action: 'require_registration' });
        return null;
    }

    const defaultPreset = opts.dmUserId ? Preset.TrustedPrivateChat : Preset.PrivateChat;

    // set some defaults for the creation
    const createOpts: ICreateRoomOpts = opts.createOpts || {};
    createOpts.preset = createOpts.preset || defaultPreset;
    createOpts.visibility = createOpts.visibility || Visibility.Private;
    if (opts.dmUserId && createOpts.invite === undefined) {
        switch (getAddressType(opts.dmUserId)) {
            case 'mx-user-id':
                createOpts.invite = [opts.dmUserId];
                break;
            case 'email':
                createOpts.invite_3pid = [{
                    id_server: MatrixClientPeg.get().getIdentityServerUrl(true),
                    medium: 'email',
                    address: opts.dmUserId,
                }];
        }
    }
    if (opts.dmUserId && createOpts.is_direct === undefined) {
        createOpts.is_direct = true;
    }

    if (opts.roomType) {
        createOpts.creation_content = {
            ...createOpts.creation_content,
            [RoomCreateTypeField]: opts.roomType,
        };
    }

    // By default, view the room after creating it
    if (opts.andView === undefined) {
        opts.andView = true;
    }

    createOpts.initial_state = createOpts.initial_state || [];

    // Allow guests by default since the room is private and they'd
    // need an invite. This means clicking on a 3pid invite email can
    // actually drop you right in to a chat.
    if (opts.guestAccess) {
        createOpts.initial_state.push({
            type: 'm.room.guest_access',
            state_key: '',
            content: {
                guest_access: 'can_join',
            },
        });
    }

    if (opts.encryption) {
        createOpts.initial_state.push({
            type: 'm.room.encryption',
            state_key: '',
            content: {
                algorithm: 'm.megolm.v1.aes-sha2',
            },
        });
    }

    if (opts.parentSpace) {
        createOpts.initial_state.push(makeSpaceParentEvent(opts.parentSpace, true));
        if (!opts.historyVisibility) {
            opts.historyVisibility = createOpts.preset === Preset.PublicChat
                ? HistoryVisibility.WorldReadable
                : HistoryVisibility.Invited;
        }

        if (opts.joinRule === JoinRule.Restricted) {
            if (SpaceStore.instance.restrictedJoinRuleSupport?.preferred) {
                createOpts.room_version = SpaceStore.instance.restrictedJoinRuleSupport.preferred;

                createOpts.initial_state.push({
                    type: EventType.RoomJoinRules,
                    content: {
                        "join_rule": JoinRule.Restricted,
                        "allow": [{
                            "type": RestrictedAllowType.RoomMembership,
                            "room_id": opts.parentSpace.roomId,
                        }],
                    },
                });
            }
        }
    }

    // we handle the restricted join rule in the parentSpace handling block above
    if (opts.joinRule && opts.joinRule !== JoinRule.Restricted) {
        createOpts.initial_state.push({
            type: EventType.RoomJoinRules,
            content: { join_rule: opts.joinRule },
        });
    }

    if (opts.avatar) {
        let url = opts.avatar;
        if (opts.avatar instanceof File) {
            url = await client.uploadContent(opts.avatar);
        }

        createOpts.initial_state.push({
            type: EventType.RoomAvatar,
            content: { url },
        });
    }

    if (opts.historyVisibility) {
        createOpts.initial_state.push({
            type: EventType.RoomHistoryVisibility,
            content: {
                "history_visibility": opts.historyVisibility,
            },
        });
    }

    let modal;
    if (opts.spinner) modal = Modal.createDialog(Spinner, null, 'mx_Dialog_spinner');

    let roomId;
    return client.createRoom(createOpts).catch(function(err) {
        // NB This checks for the Synapse-specific error condition of a room creation
        // having been denied because the requesting user wanted to publish the room,
        // but the server denies them that permission (via room_list_publication_rules).
        // The check below responds by retrying without publishing the room.
        if (err.httpStatus === 403 && err.errcode === "M_UNKNOWN" && err.data.error === "Not allowed to publish room") {
            logger.warn("Failed to publish room, try again without publishing it");
            createOpts.visibility = Visibility.Private;
            return client.createRoom(createOpts);
        } else {
            return Promise.reject(err);
        }
    }).finally(function() {
        if (modal) modal.close();
    }).then(function(res) {
        roomId = res.room_id;
        if (opts.dmUserId) {
            return Rooms.setDMRoom(roomId, opts.dmUserId);
        } else {
            return Promise.resolve();
        }
    }).then(() => {
        if (opts.parentSpace) {
            return SpaceStore.instance.addRoomToSpace(opts.parentSpace, roomId, [client.getDomain()], opts.suggested);
        }
        if (opts.associatedWithCommunity) {
            return GroupStore.addRoomToGroup(opts.associatedWithCommunity, roomId, false);
        }
    }).then(function() {
        // NB createRoom doesn't block on the client seeing the echo that the
        // room has been created, so we race here with the client knowing that
        // the room exists, causing things like
        // https://github.com/vector-im/vector-web/issues/1813
        // Even if we were to block on the echo, servers tend to split the room
        // state over multiple syncs so we can't atomically know when we have the
        // entire thing.
        if (opts.andView) {
            dis.dispatch({
                action: Action.ViewRoom,
                room_id: roomId,
                should_peek: false,
                // Creating a room will have joined us to the room,
                // so we are expecting the room to come down the sync
                // stream, if it hasn't already.
                joining: true,
                justCreatedOpts: opts,
            });
        }
        CountlyAnalytics.instance.trackRoomCreate(startTime, roomId);
        return roomId;
    }, function(err) {
        // Raise the error if the caller requested that we do so.
        if (opts.inlineErrors) throw err;

        // We also failed to join the room (this sets joining to false in RoomViewStore)
        dis.dispatch({
            action: Action.JoinRoomError,
            roomId,
        });
        logger.error("Failed to create room " + roomId + " " + err);
        let description = _t("Server may be unavailable, overloaded, or you hit a bug.");
        if (err.errcode === "M_UNSUPPORTED_ROOM_VERSION") {
            // Technically not possible with the UI as of April 2019 because there's no
            // options for the user to change this. However, it's not a bad thing to report
            // the error to the user for if/when the UI is available.
            description = _t("The server does not support the room version specified.");
        }
        Modal.createTrackedDialog('Failure to create room', '', ErrorDialog, {
            title: _t("Failure to create room"),
            description,
        });
        return null;
    });
}

export function findDMForUser(client: MatrixClient, userId: string): Room {
    const roomIds = DMRoomMap.shared().getDMRoomsForUserId(userId);
    const rooms = roomIds.map(id => client.getRoom(id));
    const suitableDMRooms = rooms.filter(r => {
        // Validate that we are joined and the other person is also joined. We'll also make sure
        // that the room also looks like a DM (until we have canonical DMs to tell us). For now,
        // a DM is a room of two people that contains those two people exactly. This does mean
        // that bots, assistants, etc will ruin a room's DM-ness, though this is a problem for
        // canonical DMs to solve.
        if (r && r.getMyMembership() === "join") {
            const members = r.currentState.getMembers();
            const joinedMembers = members.filter(m => isJoinedOrNearlyJoined(m.membership));
            const otherMember = joinedMembers.find(m => m.userId === userId);
            return otherMember && joinedMembers.length === 2;
        }
        return false;
    }).sort((r1, r2) => {
        return r2.getLastActiveTimestamp() -
            r1.getLastActiveTimestamp();
    });
    if (suitableDMRooms.length) {
        return suitableDMRooms[0];
    }
}

/*
 * Try to ensure the user is already in the megolm session before continuing
 * NOTE: this assumes you've just created the room and there's not been an opportunity
 * for other code to run, so we shouldn't miss RoomState.newMember when it comes by.
 */
export async function waitForMember(client: MatrixClient, roomId: string, userId: string, opts = { timeout: 1500 }) {
    const { timeout } = opts;
    let handler;
    return new Promise((resolve) => {
        handler = function(_, __, member: RoomMember) { // eslint-disable-line @typescript-eslint/naming-convention
            if (member.userId !== userId) return;
            if (member.roomId !== roomId) return;
            resolve(true);
        };
        client.on("RoomState.newMember", handler);

        /* We don't want to hang if this goes wrong, so we proceed and hope the other
           user is already in the megolm session */
        setTimeout(resolve, timeout, false);
    }).finally(() => {
        client.removeListener("RoomState.newMember", handler);
    });
}

/*
 * Ensure that for every user in a room, there is at least one device that we
 * can encrypt to.
 */
export async function canEncryptToAllUsers(client: MatrixClient, userIds: string[]) {
    try {
        const usersDeviceMap = await client.downloadKeys(userIds);
        // { "@user:host": { "DEVICE": {...}, ... }, ... }
        return Object.values(usersDeviceMap).every((userDevices) =>
            // { "DEVICE": {...}, ... }
            Object.keys(userDevices).length > 0,
        );
    } catch (e) {
        logger.error("Error determining if it's possible to encrypt to all users: ", e);
        return false; // assume not
    }
}

// Similar to ensureDMExists but also adds creation content
// without polluting ensureDMExists with unrelated stuff (also
// they're never encrypted).
export async function ensureVirtualRoomExists(
    client: MatrixClient, userId: string, nativeRoomId: string,
): Promise<string> {
    const existingDMRoom = findDMForUser(client, userId);
    let roomId;
    if (existingDMRoom) {
        roomId = existingDMRoom.roomId;
    } else {
        roomId = await createRoom({
            dmUserId: userId,
            spinner: false,
            andView: false,
            createOpts: {
                creation_content: {
                    // This allows us to recognise that the room is a virtual room
                    // when it comes down our sync stream (we also put the ID of the
                    // respective native room in there because why not?)
                    [VIRTUAL_ROOM_EVENT_TYPE]: nativeRoomId,
                },
            },
        });
    }
    return roomId;
}

export async function ensureDMExists(client: MatrixClient, userId: string): Promise<string> {
    const existingDMRoom = findDMForUser(client, userId);
    let roomId;
    if (existingDMRoom) {
        roomId = existingDMRoom.roomId;
    } else {
        let encryption: boolean = undefined;
        if (privateShouldBeEncrypted()) {
            encryption = await canEncryptToAllUsers(client, [userId]);
        }

        roomId = await createRoom({ encryption, dmUserId: userId, spinner: false, andView: false });
        await waitForMember(client, roomId, userId);
    }
    return roomId;
}

export function privateShouldBeEncrypted(): boolean {
    const e2eeWellKnown = getE2EEWellKnown();
    if (e2eeWellKnown) {
        const defaultDisabled = e2eeWellKnown["default"] === false;
        return !defaultDisabled;
    }
    return true;
}
