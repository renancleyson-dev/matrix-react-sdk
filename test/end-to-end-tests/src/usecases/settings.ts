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
import { ElementSession } from "../session";

export async function openSettings(session: ElementSession, section: string): Promise<void> {
    const menuButton = await session.query(".mx_UserMenu");
    await menuButton.click();
    const settingsItem = await session.query(".mx_UserMenu_iconSettings");
    await settingsItem.click();
    if (section) {
        const sectionButton = await session.query(
            `.mx_UserSettingsDialog .mx_TabbedView_tabLabels .mx_UserSettingsDialog_${section}Icon`);
        await sectionButton.click();
    }
}

export async function enableLazyLoading(session: ElementSession): Promise<void> {
    session.log.step(`enables lazy loading of members in the lab settings`);
    const settingsButton = await session.query('.mx_BottomLeftMenu_settings');
    await settingsButton.click();
    const llCheckbox = await session.query("#feature_lazyloading");
    await llCheckbox.click();
    await session.waitForReload();
    const closeButton = await session.query(".mx_RoomHeader_cancelButton");
    await closeButton.click();
    session.log.done();
}

interface E2EDevice {
    id: string;
    key: string;
}

export async function getE2EDeviceFromSettings(session: ElementSession): Promise<E2EDevice> {
    session.log.step(`gets e2e device/key from settings`);
    await openSettings(session, "security");
    const deviceAndKey = await session.queryAll(".mx_SettingsTab_section .mx_CryptographyPanel code");
    assert.equal(deviceAndKey.length, 2);
    const id: string = await (await deviceAndKey[0].getProperty("innerText")).jsonValue();
    const key: string = await (await deviceAndKey[1].getProperty("innerText")).jsonValue();
    const closeButton = await session.query(".mx_UserSettingsDialog .mx_Dialog_cancelButton");
    await closeButton.click();
    session.log.done();
    return { id, key };
}
