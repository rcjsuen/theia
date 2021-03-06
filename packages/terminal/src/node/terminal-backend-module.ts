/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, Container } from 'inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { TerminalBackendContribution } from "./terminal-backend-contribution";
import { ShellProcess, ShellProcessFactory, ShellProcessOptions } from './shell-process';
import { ILogger } from '@theia/core/lib/common/logger';

export default new ContainerModule(bind => {
    bind(BackendApplicationContribution).to(TerminalBackendContribution);
    bind(ShellProcess).toSelf().inTransientScope();
    bind(ShellProcessFactory).toFactory(ctx =>
        (options: ShellProcessOptions) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;

            const logger = ctx.container.get<ILogger>(ILogger);
            const loggerChild = logger.child({ 'module': 'terminal-backend' });
            child.bind(ShellProcessOptions).toConstantValue({});
            child.bind(ILogger).toConstantValue(loggerChild);
            return child.get(ShellProcess);
        }
    );
});
