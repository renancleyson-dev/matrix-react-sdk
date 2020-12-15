/*
Copyright 2020 The Matrix.org Foundation C.I.C.

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

import * as React from "react";
import EMSElementProDialog from "../views/dialogs/EMSElementProDialog";
import Modal from "../../Modal";
import {
    IconizedContextMenuOption,
    IconizedContextMenuOptionList,
} from "../views/context_menus/IconizedContextMenu";
import { _t } from "../../languageHandler";

interface IProps {}

interface IState {}

export default class EMSElementProAction extends React.PureComponent<IProps, IState> {
    closingAllowed = false;
    modalRef: any;

    private openDialog = () => {
        this.modalRef = Modal.createTrackedDialog(
            'Element Pro Open', '', EMSElementProDialog, {
                requestClose: this.requestClose,
            }, "mx_EMSElementProDialog", false, true, {
                onBeforeClose: async () => this.closingAllowed,
            },
        );
    }

    private requestClose = () => {
        this.closingAllowed = true;
        this.modalRef.close();
    }

    public render(): React.ReactNode {
        return (
            <IconizedContextMenuOptionList>
                <IconizedContextMenuOption
                    iconClassName="mx_UserMenu_iconHosting"
                    label={_t("Get your own Element!")}
                    onClick={(e) => this.openDialog()}
                />
            </IconizedContextMenuOptionList>
        );
    }
}