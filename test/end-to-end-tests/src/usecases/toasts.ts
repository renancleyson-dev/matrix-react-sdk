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

import { strict as assert } from 'assert';
import { ElementSession } from "../session";

export async function assertNoToasts(session: ElementSession): Promise<void> {
    try {
        await session.query('.mx_Toast_toast', 1000, true);
    } catch (e) {
        const h2Element = await session.query('.mx_Toast_title h2', 1000);
        const toastTitle = await session.innerText(h2Element);
        throw new Error(`"${toastTitle}" toast found when none expected`);
    }
}

export async function assertToast(session: ElementSession, expectedTitle: string): Promise<void> {
    const h2Element = await session.query('.mx_Toast_title h2');
    const toastTitle = await session.innerText(h2Element);
    assert.equal(toastTitle, expectedTitle);
}

export async function acceptToast(session: ElementSession, expectedTitle: string): Promise<void> {
    await assertToast(session, expectedTitle);
    const btn = await session.query('.mx_Toast_buttons .mx_AccessibleButton_kind_primary');
    await btn.click();
}

export async function rejectToast(session: ElementSession, expectedTitle: string): Promise<void> {
    await assertToast(session, expectedTitle);
    const btn = await session.query('.mx_Toast_buttons .mx_AccessibleButton_kind_danger_outline');
    await btn.click();
}
