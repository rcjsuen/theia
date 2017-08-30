/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";

import { LanguageClientContribution } from "@theia/languages/lib/browser";
import { DockerClientContribution } from "./docker-client-contribution";

export default new ContainerModule(bind => {
    bind(DockerClientContribution).toSelf().inSingletonScope();
    bind(LanguageClientContribution).toDynamicValue(ctx => ctx.container.get(DockerClientContribution));
});
