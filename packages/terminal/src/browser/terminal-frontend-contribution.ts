/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify"
import {
    CommandContribution,
    KeybindingContribution,
    KeyCode,
    Key,
    Modifier,
    KeybindingRegistry,
    Command,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry
} from '@theia/core/lib/common';
import { FrontendApplication, Endpoint } from '@theia/core/lib/browser';
import { FileMenus } from '@theia/workspace/lib/browser/workspace-commands';
import { TerminalWidgetFactory, TerminalWidgetOptions } from './terminal-widget';

export namespace TerminalCommands {
    export const NEW: Command = {
        id: 'terminal:new',
        label: 'New Terminal'
    }
}

@injectable()
export class TerminalFrontendContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    protected terminalNum = 0;

    constructor(
        @inject(FrontendApplication) protected readonly app: FrontendApplication,
        @inject(TerminalWidgetFactory) protected readonly terminalWidgetFactory: TerminalWidgetFactory
    ) { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(TerminalCommands.NEW, {
            isEnabled: () => true,
            execute: () => this.newTerminal()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(FileMenus.OPEN_GROUP, {
            commandId: TerminalCommands.NEW.id
        });
    }

    registerKeyBindings(keybindings: KeybindingRegistry): void {
        [
            {
                commandId: TerminalCommands.NEW.id,
                keyCode: KeyCode.createKeyCode({ first: Key.BACKQUOTE, modifiers: [Modifier.M1] })
            },
        ].forEach(binding => {
            keybindings.registerKeyBinding(binding);
        });
    }

    protected newTerminal(): void {
        const newTerminal = this.terminalWidgetFactory(<TerminalWidgetOptions>{
            endpoint: new Endpoint({ path: '/services/terminals' }),
            id: 'terminal-' + this.terminalNum,
            caption: 'Terminal ' + this.terminalNum,
            label: 'Terminal ' + this.terminalNum,
            destroyTermOnClose: true
        });
        this.terminalNum++;

        newTerminal.start();
        this.app.shell.addToMainArea(newTerminal);
        this.app.shell.activateMain(newTerminal.id);
    }

}
