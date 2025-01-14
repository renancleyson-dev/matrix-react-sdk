/*
Copyright 2018 New Vector Ltd
Copyright 2019 The Matrix.org Foundation C.I.C.

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

import { strict as assert } from 'assert';
import { openRoomSummaryCard } from "./rightpanel";
import { ElementSession } from "../session";
import { ElementHandle } from "puppeteer";

export async function openMemberInfo(session: ElementSession, name: String): Promise<void> {
    const membersAndNames = await getMembersInMemberlist(session);
    const matchingLabel = membersAndNames.filter((m) => {
        return m.displayName === name;
    }).map((m) => m.label)[0];
    await matchingLabel.click();
}

interface Device {
    id: string;
    key: string;
}

export async function verifyDeviceForUser(session: ElementSession, name: string,
    expectedDevice: Device): Promise<void> {
    session.log.step(`verifies e2e device for ${name}`);
    const membersAndNames = await getMembersInMemberlist(session);
    const matchingLabel = membersAndNames.filter((m) => {
        return m.displayName === name;
    }).map((m) => m.label)[0];
    await matchingLabel.click();
    // click verify in member info
    const firstVerifyButton = await session.query(".mx_MemberDeviceInfo_verify");
    await firstVerifyButton.click();
    // expect "Verify device" dialog and click "Begin Verification"
    const dialogHeader = await session.innerText(await session.query(".mx_Dialog .mx_Dialog_title"));
    assert(dialogHeader, "Verify device");
    const beginVerificationButton = await session.query(".mx_Dialog .mx_Dialog_primary");
    await beginVerificationButton.click();
    // get emoji SAS labels
    const sasLabelElements = await session.queryAll(
        ".mx_VerificationShowSas .mx_VerificationShowSas_emojiSas .mx_VerificationShowSas_emojiSas_label");
    const sasLabels = await Promise.all(sasLabelElements.map(e => session.innerText(e)));
    console.log("my sas labels", sasLabels);

    const dialogCodeFields = await session.queryAll(".mx_QuestionDialog code");
    assert.strictEqual(dialogCodeFields.length, 2);
    const deviceId = await session.innerText(dialogCodeFields[0]);
    const deviceKey = await session.innerText(dialogCodeFields[1]);
    assert.strictEqual(expectedDevice.id, deviceId);
    assert.strictEqual(expectedDevice.key, deviceKey);
    const confirmButton = await session.query(".mx_Dialog_primary");
    await confirmButton.click();
    const closeMemberInfo = await session.query(".mx_MemberInfo_cancel");
    await closeMemberInfo.click();
    session.log.done();
}

interface MemberName {
    label: ElementHandle;
    displayName: string;
}

export async function getMembersInMemberlist(session: ElementSession): Promise<MemberName[]> {
    await openRoomSummaryCard(session);
    const memberPanelButton = await session.query(".mx_RoomSummaryCard_icon_people");
    // We are back at the room summary card
    await memberPanelButton.click();

    const memberNameElements = await session.queryAll(".mx_MemberList .mx_EntityTile_name");
    return Promise.all(memberNameElements.map(async (el) => {
        return { label: el, displayName: await session.innerText(el) };
    }));
}
