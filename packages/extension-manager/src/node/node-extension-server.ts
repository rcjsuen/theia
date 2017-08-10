/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as semver from 'semver';
import { injectable, inject } from 'inversify';
import { ExtensionPackage, view } from 'generator-theia';
import * as npm from 'generator-theia/generators/common/npm';
import { DisposableCollection } from '@theia/core';
import {
    RawExtension, ResolvedRawExtension, ResolvedExtension, Extension, ExtensionServer, ExtensionClient, SearchParam
} from '../common/extension-protocol';
import * as npms from './npms';
import { AppProject } from './app-project';
import * as showdown from 'showdown';
import * as sanitize from 'sanitize-html';
import * as fs from 'fs';

export interface InstallationState {
    readonly installed: RawExtension[];
    readonly outdated: RawExtension[];
}

@injectable()
export class NodeExtensionServer implements ExtensionServer {

    protected client: ExtensionClient | undefined;
    protected readonly toDispose = new DisposableCollection();

    protected readonly busyExtensions = new Set<string>();

    constructor(@inject(AppProject) protected readonly appProject: AppProject) {
        this.toDispose.push(appProject.onDidChangePackage(() =>
            this.notification('onDidChange')()
        ));
        this.toDispose.push(appProject.onWillInstall(() =>
            this.notification('onWillStartInstallation')()
        ));
        this.toDispose.push(appProject.onDidInstall(params =>
            this.notification('onDidStopInstallation')(params)
        ));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    setClient(client: ExtensionClient | undefined): void {
        this.client = client;
    }

    protected notification<T extends keyof ExtensionClient>(notification: T): ExtensionClient[T] {
        if (this.client) {
            return this.client[notification];
        }
        return () => {
        };
    }

    async search(param: SearchParam): Promise<RawExtension[]> {
        const projectModel = await this.appProject.load();
        const extensionKeywords = projectModel.config.extensionKeywords;
        const query = this.prepareQuery(param.query, extensionKeywords);
        const packages = await npms.search(query, param.from, param.size);
        const extensions = [];
        for (const pck of packages) {
            if (ExtensionPackage.is(pck, extensionKeywords)) {
                const extension = this.toRawExtension(pck);
                extensions.push(extension);
            }
        }
        return extensions;
    }

    protected prepareQuery(query: string, extensionKeywords: string[]): string {
        const args = query.split(/\s+/).map(v => v.toLowerCase().trim()).filter(v => !!v);
        return [`keywords:'${extensionKeywords.join(',')}'`, ...args].join(' ');
    }

    resolveRaw(extension: string): Promise<ResolvedRawExtension> {
        return new Promise(resolve => {
        });
    }

    /**
     * Extension packages listed in `theia.package.json` are installed.
     */
    installed(): Promise<RawExtension[]> {
        return this.appProject.load().then(projectModel => {
            const extensions = [];
            for (const pck of projectModel.extensionPackages) {
                const extension = this.toRawExtension(pck);
                extensions.push(extension);
            }
            return extensions;
        });
    }

    async install(extension: string): Promise<void> {
        this.setExtensionsBusyFlag(extension, true);
        const latestVersion = await this.latestVersion(extension);
        if (latestVersion) {
            await this.appProject.update(model => model.setDependency(extension, latestVersion));
        }
        this.setExtensionsBusyFlag(extension, false);
    }

    async uninstall(extension: string): Promise<void> {
        this.setExtensionsBusyFlag(extension, true);
        await this.appProject.update(model => model.setDependency(extension, undefined));
        this.setExtensionsBusyFlag(extension, false);
    }

    /**
     * Extension packages listed in `theia.package.json`
     * with versions less than the latest published are outdated.
     */
    async outdated(): Promise<RawExtension[]> {
        const installed = await this.installed();
        const outdated = await Promise.all(
            installed.map(extension => this.validateOutdated(extension.name, extension.version))
        );
        return installed.filter((_, index) => !!outdated[index]);
    }

    async update(extension: string): Promise<void> {
        this.setExtensionsBusyFlag(extension, true);
        await this.appProject.update(async model => {
            const pck = model.extensionPackages.find(p => p.name === extension);
            if (!pck || !pck.version) {
                return false;
            }
            const latestVersion = await this.validateOutdated(pck.name, pck.version);
            if (!latestVersion) {
                return false;
            }
            return model.setDependency(extension, latestVersion);
        });
        this.setExtensionsBusyFlag(extension, false);
    }

    protected setExtensionsBusyFlag(extension: string, busy: boolean): void {
        if (busy) {
            this.busyExtensions.add(extension);
        } else {
            this.busyExtensions.delete(extension);
        }
        if (this.client) {
            this.client.onDidChange();
        }
    }

    protected async installationState(): Promise<InstallationState> {
        const [installed, outdated] = await Promise.all([this.installed(), this.outdated()]);
        return {installed, outdated};
    }

    protected toExtension(raw: RawExtension, installation: InstallationState): Extension {
        const busy = this.busyExtensions.has(raw.name);
        const outdated = installation.outdated.some(e => e.name === raw.name);
        const installed = outdated || installation.installed.some(e => e.name === raw.name);
        return Object.assign(raw, {busy, installed, outdated});
    }

    async list(param?: SearchParam): Promise<Extension[]> {
        const installation = await this.installationState();
        const extensions = param && param.query ? await this.search(param) : installation.installed;
        return extensions.map(raw =>
            this.toExtension(raw, installation)
        );
    }

    async resolve(extension: string): Promise<ResolvedExtension> {
        const projectModel = await this.appProject.load();

        let installed = false;
        let outdated = false;
        const busy = this.busyExtensions.has(extension);
        let version: string;
        let readme: string | undefined;
        let extensionPackage = projectModel.extensionPackages.find(pck => pck.name === extension);
        if (extensionPackage) {
            readme = extensionPackage.readme;
            if (!readme && !!extensionPackage.localPath) {
                readme = fs.readFileSync(extensionPackage.localPath + '/README.md', {encoding: 'utf8'});
            }
            installed = true;
            const latestVersion = extensionPackage.latestVersion;
            version = extensionPackage.version;
            outdated = !!latestVersion && semver.gt(latestVersion, version);
        } else {
            const viewResult = await view({name: extension, abbreviated: false});
            version = viewResult['dist-tags'].latest;
            extensionPackage = (viewResult.versions[version] as ExtensionPackage);
            readme = (viewResult['readme'] as string);
        }

        const author = this.getAuthor(extensionPackage);
        const markdownConverter = new showdown.Converter({
            noHeaderId: true,
            strikethrough: true
        });
        const readmeHtml = markdownConverter.makeHtml(readme || '');
        const readmeSanitized = !!readme ? sanitize(readmeHtml, {
            allowedTags: sanitize.defaults.allowedTags.concat(['h1', 'h2', 'img'])
        }) : '';

        const resolvedExtension = {
                busy,
                installed,
                outdated,
                name: extensionPackage.name,
                version,
                description: extensionPackage.description || '',
                author,
                documentation: readmeSanitized
            }
        ;

        return resolvedExtension;
    }

    protected async validateOutdated(extension: string, version: string): Promise<string | undefined> {
        const latest = await this.latestVersion(extension);
        return !!latest && semver.gt(latest, version) ? latest : undefined;
    }

    protected latestVersion(extension: string): Promise<string | undefined> {
        return npm.version(extension).catch(() => undefined);
    }

    protected toRawExtension(pck: ExtensionPackage): RawExtension {
        return {
            name: pck.name,
            version: pck.version || '',
            description: pck.description || '',
            author: this.getAuthor(pck)
        };
    }

    protected getAuthor(pck: ExtensionPackage): string {
        if (pck.publisher) {
            return pck.publisher.username;
        }
        if (typeof pck.author === 'string') {
            return pck.author;
        }
        if (pck.author && pck.author.name) {
            return pck.author.name;
        }
        if (!!pck.maintainers && pck.maintainers.length > 0) {
            return pck.maintainers[0].username;
        }
        return '';
    }

    needInstall(): Promise<boolean> {
        return this.appProject.needInstall();
    }

    scheduleInstall(): Promise<void> {
        return this.appProject.scheduleInstall({
            force: true
        });
    }

}
