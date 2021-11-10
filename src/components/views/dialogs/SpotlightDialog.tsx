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

import React, { useState } from "react";

import { IDialogProps } from "./IDialogProps";
import Field from "../elements/Field";
import { _t } from "../../../languageHandler";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import BaseDialog from "./BaseDialog";
import SearchBox from "../../structures/SearchBox";

interface IProps extends IDialogProps {
    initialText?: string;
}

const SpotlightDialog: React.FC<IProps> = ({ initialText = "", onFinished }) => {
    const [query, setQuery] = useState("");
    const cli = MatrixClientPeg.get();

    let content: JSX.Element;
    if (query) {
        content = <>
            <div className="mx_SpotlightDialog_section">
                <h4>{ _t("Rooms") }</h4>
            </div>
        </>;
    } else {
        content = <>
            <div className="mx_SpotlightDialog_section">
                <h4>{ _t("Recently viewed") }</h4>
            </div>

            <div className="mx_SpotlightDialog_section">
                <h4>{ _t("Recent searches") }</h4>
            </div>
        </>;
    }

    return <>
        <div className="mx_SpotlightDialog_keyboardPrompt">
            { _t("Use <arrows/> to scroll results", {}, {
                arrows: () => <>
                    <div>↓</div>
                    <div>↑</div>
                </>,
            }) }
        </div>

        <BaseDialog className="mx_SpotlightDialog" onFinished={onFinished} hasCancel={false}>
            <SearchBox
                autoFocus
                placeholder={_t("Search for anything")}
                initialValue={initialText}
                onSearch={setQuery}
            />

            <div className="mx_SpotlightDialog_content">
                { content }
            </div>
        </BaseDialog>
    </>;
};

export default SpotlightDialog;
