/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { BaseLanguageServerContribution, IConnection } from "@theia/languages/lib/node";
import { DOCKER_LANGUAGE_ID, DOCKER_LANGUAGE_NAME } from '../common';

@injectable()
export class DockerContribution extends BaseLanguageServerContribution {

    readonly id = DOCKER_LANGUAGE_ID;
    readonly name = DOCKER_LANGUAGE_NAME;

    start(clientConnection: IConnection): void {
        const command = "docker-langserver";
        const args = ["--stdio"];
        const serverConnection = this.createProcessStreamConnection(command, args);
        this.forward(clientConnection, serverConnection);
    }

    protected onDidFailSpawnProcess(error: Error): void {
        super.onDidFailSpawnProcess(error);
        console.error("Error starting the Docker language server.");
    }
}
