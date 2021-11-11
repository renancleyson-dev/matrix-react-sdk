/*
Copyright 2021 The Matrix.org Foundation C.I.C.

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

import React, { ComponentProps, KeyboardEvent, useContext, useState } from "react";

import { IDialogProps } from "./IDialogProps";
import { _t } from "../../../languageHandler";
import BaseDialog from "./BaseDialog";
import SearchBox from "../../structures/SearchBox";
import { BreadcrumbsStore } from "../../../stores/BreadcrumbsStore";
import RoomAvatar from "../avatars/RoomAvatar";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import {
    findSiblingElement, RovingAccessibleButton,
    RovingTabIndexContext,
    RovingTabIndexProvider,
    Type, useRovingTabIndex,
} from "../../../accessibility/RovingTabIndex";
import { Key } from "../../../Keyboard";
import AccessibleButton from "../elements/AccessibleButton";

const Option: React.FC<ComponentProps<typeof RovingAccessibleButton>> = ({ inputRef, ...props }) => {
    const [onFocus, isActive, ref] = useRovingTabIndex(inputRef);
    return <AccessibleButton
        {...props}
        onFocus={onFocus}
        inputRef={ref}
        tabIndex={-1}
        aria-selected={isActive}
        role="option"
    />;
};

interface IProps extends IDialogProps {
    initialText?: string;
}

const SpotlightDialog: React.FC<IProps> = ({ initialText = "", onFinished }) => {
    const rovingContext = useContext(RovingTabIndexContext);
    const [query, setQuery] = useState("");

    let content: JSX.Element;
    if (query) {
        content = <>
            <div className="mx_SpotlightDialog_section" role="group">
                <h4>{ _t("Rooms") }</h4>
            </div>
        </>;
    } else {
        content = <>
            <div className="mx_SpotlightDialog_section mx_SpotlightDialog_recents" role="group">
                <h4>{ _t("Recently viewed") }</h4>
                <div>
                    { BreadcrumbsStore.instance.rooms.map(room => (
                        <Option
                            id={`mx_SpotlightDialog_button_recent_${room.roomId}`}
                            key={room.roomId}
                            className="mx_SpotlightDialog_recent"
                            onClick={() => {
                                defaultDispatcher.dispatch({
                                    action: 'view_room',
                                    room_id: room.roomId,
                                });
                                onFinished();
                            }}
                        >
                            <RoomAvatar room={room} width={20} height={20} />
                            { room.name }
                        </Option>
                    )) }
                </div>
            </div>

            <div className="mx_SpotlightDialog_section" role="group">
                <h4>{ _t("Recent searches") }</h4>
            </div>
        </>;
    }

    const onDialogKeyDown = (ev: KeyboardEvent) => {
        if (ev.key === Key.ESCAPE) {
            ev.stopPropagation();
            ev.preventDefault();
            onFinished();
        }
    };

    const onKeyDown = (ev: KeyboardEvent) => {
        switch (ev.key) {
            case Key.ARROW_UP:
            case Key.ARROW_DOWN:
                ev.stopPropagation();
                ev.preventDefault();

                if (rovingContext.state.refs.length > 0) {
                    const idx = rovingContext.state.refs.indexOf(rovingContext.state.activeRef);
                    const ref = findSiblingElement(rovingContext.state.refs, idx + (ev.key === Key.ARROW_UP ? -1 : 1));

                    if (ref) {
                        rovingContext.dispatch({
                            type: Type.SetFocus,
                            payload: { ref },
                        });
                        ref.current?.scrollIntoView();
                    }
                }
                break;

            case Key.ENTER:
                ev.stopPropagation();
                ev.preventDefault();
                rovingContext.state.activeRef?.current?.click();
                break;
        }
    };

    const activeDescendant = rovingContext.state.activeRef?.current?.id;

    return <>
        <div className="mx_SpotlightDialog_keyboardPrompt">
            { _t("Use <arrows/> to scroll results", {}, {
                arrows: () => <>
                    <div>↓</div>
                    <div>↑</div>
                </>,
            }) }
        </div>

        <BaseDialog
            className="mx_SpotlightDialog"
            onFinished={onFinished}
            hasCancel={false}
            onKeyDown={onDialogKeyDown}
        >
            <SearchBox
                autoFocus
                placeholder={_t("Search for anything")}
                initialValue={initialText}
                onSearch={setQuery}
                onKeyDown={onKeyDown}
                aria-owns="mx_SpotlightDialog_content"
                aria-activedescendant={activeDescendant}
            />

            <div id="mx_SpotlightDialog_content" role="listbox" aria-activedescendant={activeDescendant}>
                { content }
            </div>
        </BaseDialog>
    </>;
};

const RovingSpotlightDialog: React.FC<IProps> = (props) => {
    return <RovingTabIndexProvider>
        { () => <SpotlightDialog {...props} /> }
    </RovingTabIndexProvider>;
};

export default RovingSpotlightDialog;
