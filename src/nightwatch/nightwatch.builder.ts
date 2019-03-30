import {
  Builder,
  BuilderConfiguration,
  BuilderContext,
  BuildEvent
} from '@angular-devkit/architect';
import { Observable, of, Subscriber, noop } from 'rxjs';
import { catchError, concatMap, tap, map, take } from 'rxjs/operators';
import { ChildProcess, fork } from 'child_process';
import { removeSync } from 'fs-extra';
import { fromPromise } from 'rxjs/internal-compatibility';
import { DevServerBuilderOptions } from '@angular-devkit/build-angular';
import { readFile } from '@angular-devkit/schematics/tools/file-system-utility';
import { getSystemPath, join } from '@angular-devkit/core';
import * as path from 'path';
import * as url from 'url';
import treeKill from 'tree-kill';
const Nightwatch = require('nightwatch');

export interface NightwatchBuilderOptions {
  nightwatchConfig: string;
  devServerTarget: string;
  tsConfig: string;
  watch: boolean;
}

try {
  require('dotenv').config();
} catch (e) {}

/**
 * @whatItDoes Implementation of the Nightwatch Builder, compile Typescript files,
 * build the devServer to serve the app then run Nightwatch e2e test runner.
 * The builder needs some information from the `angular.json` file:
 * @example:
```
 "my-app-e2e": {
    "root": "apps/my-app-e2e/",
    "projectType": "application",
    "architect": {
      "e2e": {
        "builder": "@pfa/builders:nightwatch",
        "options": {
          "nightwatchConfig": "apps/my-app-e2e/nightwatch.json",
          "tsConfig": "apps/my-app-e2e/tsconfig.e2e.json",
          "devServerTarget": "my-app:serve"
      },
      "configurations": {
        "production": {
          "devServerTarget": "my-app:serve:production"
        }
      }
      }
    }
 }
```
 *
 */
export default class NightwatchBuilder
  implements Builder<NightwatchBuilderOptions> {
  private computedCypressBaseUrl: string | undefined;
  private tscProcess: ChildProcess | null = null;
  private webdriverProcess: ChildProcess | null = null;

  constructor(public context: BuilderContext) {}

  /**
   * @whatItDoes This is the starting point of the builder.
   * @param builderConfig
   */
  run(
    builderConfig: BuilderConfiguration<NightwatchBuilderOptions>
  ): Observable<BuildEvent> {
    const options = builderConfig.options;
    const tsconfigJson = JSON.parse(readFile(options.tsConfig));

    // Cleaning the /dist folder
    removeSync(
      path.join(
        path.dirname(options.tsConfig),
        tsconfigJson.compilerOptions.outDir
      )
    );

    return this.compileTypescriptFiles(options.tsConfig, options.watch).pipe(
      concatMap(() =>
        options.devServerTarget
          ? this.startDevServer(options.devServerTarget, options.watch)
          : of(null)
      ),
      concatMap(() => this.startWebdriver(options.nightwatchConfig)),
      concatMap(() => {
        console.log('options', options);
        return this.initNightwatch(options.nightwatchConfig, options.watch);
      }),
      options.watch ? tap(noop) : take(1),
      catchError(error => {
        throw new Error(error);
      })
    );
  }

  /**
   * @whatItDoes Compile typescript spec files to be able to run Cypress.
   * The compilation is done via executing the `tsc` command line/
   * @param tsConfigPath
   * @param isWatching
   */
  private compileTypescriptFiles(
    tsConfigPath: string,
    isWatching: boolean
  ): Observable<BuildEvent> {
    if (this.tscProcess) {
      this.killProcess(this.tscProcess);
    }
    return Observable.create((subscriber: Subscriber<BuildEvent>) => {
      try {
        let args = ['-p', tsConfigPath];
        const tscPath = getSystemPath(
          join(this.context.workspace.root, '/node_modules/typescript/bin/tsc')
        );
        if (isWatching) {
          args.push('--watch');
          this.tscProcess = fork(tscPath, args, { stdio: [0, 1, 2, 'ipc'] });
          this.tscProcess.on('message', _ => {
            subscriber.next({ success: true });
          });
          subscriber.next({ success: true });
        } else {
          this.tscProcess = fork(tscPath, args, { stdio: [0, 1, 2, 'ipc'] });
          this.tscProcess.on('exit', code => {
            subscriber.next({ success: code === 0 });
            subscriber.complete();
          });
        }
      } catch (error) {
        if (this.tscProcess) {
          this.killProcess(this.tscProcess);
        }
        subscriber.error(
          new Error(`Could not compile Typescript files: \n ${error}`)
        );
      }
    });
  }

  private startWebdriver(nightwatchConfig: string): Observable<BuildEvent> {
    console.log('starting web driver...');
    if (this.webdriverProcess) {
      this.killProcess(this.webdriverProcess);
    }
    return Observable.create((subscriber: Subscriber<BuildEvent>) => {
      try {
        const nightwatchConfigJson: {
          webdriver: { port: number };
        } = JSON.parse(readFile(nightwatchConfig));
        let args = ['--port', String(nightwatchConfigJson.webdriver.port)];
        const bin = getSystemPath(
          join(this.context.workspace.root, '/node_modules/.bin/chromedriver')
        );
        // if (isWatching) {
        // args.push('--watch');
        // this.tscProcess = fork(tscPath, args, { stdio: [0, 1, 2, 'ipc'] });
        // subscriber.next({ success: true });
        // } else {
        this.webdriverProcess = fork(bin, args.filter(x => x === 'dungahk'), {
          stdio: [0, 1, 2, 'ipc']
        });
        this.webdriverProcess.on('exit', code => {
          subscriber.next({ success: code === 0 });
          subscriber.complete();
        });
        subscriber.next({ success: true });
        // }
      } catch (error) {
        if (this.tscProcess) {
          this.killProcess(this.tscProcess);
        }
        subscriber.error(
          new Error(`Could not compile Typescript files: \n ${error}`)
        );
      }
    });
  }

  /**
   * @whatItDoes Copy all the fixtures into the dist folder.
   * This is done because `tsc` doesn't handle `json` files.
   * @param tsConfigPath
   */
  // private copyCypressFixtures(tsConfigPath: string, cypressConfigPath: string) {
  //   const cypressConfig = JSON.parse(readFile(cypressConfigPath));
  //   // DOn't copy fixtures if cypress config does not have it set
  //   if (!cypressConfig.fixturesFolder) {
  //     return;
  //   }

  //   copySync(
  //     `${path.dirname(tsConfigPath)}/src/fixtures`,
  //     path.join(path.dirname(cypressConfigPath), cypressConfig.fixturesFolder),
  //     { overwrite: true }
  //   );
  // }

  /**
   * @whatItDoes Initialize the Cypress test runner with the provided project configuration.
   * If `headless` is `false`: open the Cypress application, the user will
   * be able to interact directly with the application.
   * If `headless` is `true`: Cypress will run in headless mode and will
   * provide directly the results in the console output.
   * @param nightwatchConfig
   * @param headless
   * @param baseUrl
   * @param isWatching
   */
  private initNightwatch(
    nightwatchConfig: string,
    isWatching: boolean
  ): Observable<BuildEvent> {
    console.log('initing nightwatch...');
    const nightwatchJson: {
      src_folders: string | Array<string>;
      webdriver: { server_path: string; start_process: boolean };
    } = JSON.parse(readFile(nightwatchConfig));
    console.log(isWatching);
    // Cypress expects the folder where a `cypress.json` is present
    const projectFolderPath = path.dirname(nightwatchConfig);
    const options: any = {
      project: projectFolderPath
    };

    // If not, will use the `baseUrl` normally from `cypress.json`
    if (this.computedCypressBaseUrl) {
      options.config = { baseUrl: this.computedCypressBaseUrl };
    }

    nightwatchJson.webdriver.start_process = false;

    return fromPromise<any>(
      Nightwatch.runTests(
        {
          config: nightwatchConfig
        },
        nightwatchJson
      )
    ).pipe(
      tap(() => {
        console.log(isWatching);
        if (!isWatching) {
          console.log('exiting...');
          process.exit();
        }
      }), // Forcing `cypress.open` to give back the terminal
      map(_ => ({ success: true }))
      // map(result => {
      //   console.log(result);
      //   return ({
      //     /**
      //      * `cypress.open` is returning `0` and is not of the same type as `cypress.run`.
      //      * `cypress.open` is the graphical UI, so it will be obvious to know what wasn't
      //      * working. Forcing the build to success when `cypress.open` is used.
      //      */
      //     success: result.hasOwnProperty(`totalFailed`)
      //       ? result.totalFailed === 0
      //       : true
      //   })
      // })
    );
  }

  /**
   * @whatItDoes Compile the application using the webpack builder.
   * @param devServerTarget
   * @param isWatching
   * @private
   */
  private startDevServer(
    devServerTarget: string,
    isWatching: boolean
  ): Observable<BuildEvent> {
    console.log('starting dev server...');
    const architect = this.context.architect;
    const [project, targetName, configuration] = devServerTarget.split(':');
    // Overrides dev server watch setting.
    const overrides: Partial<DevServerBuilderOptions> = { watch: isWatching };
    const targetSpec = {
      project,
      target: targetName,
      configuration,
      overrides: overrides
    };
    const builderConfig = architect.getBuilderConfiguration<
      DevServerBuilderOptions
    >(targetSpec);

    return architect.getBuilderDescription(builderConfig).pipe(
      concatMap(devServerDescription =>
        architect.validateBuilderOptions(builderConfig, devServerDescription)
      ),
      tap(builderConfig => {
        if (devServerTarget && builderConfig.options.publicHost) {
          let publicHost = builderConfig.options.publicHost;
          if (!/^\w+:\/\//.test(publicHost)) {
            publicHost = `${
              builderConfig.options.ssl ? 'https' : 'http'
            }://${publicHost}`;
          }
          const clientUrl = url.parse(publicHost);
          this.computedCypressBaseUrl = url.format(clientUrl);
        } else if (devServerTarget) {
          this.computedCypressBaseUrl = url.format({
            protocol: builderConfig.options.ssl ? 'https' : 'http',
            hostname: builderConfig.options.host,
            port: builderConfig.options.port.toString(),
            pathname: builderConfig.options.servePath || ''
          });
        }
      }),
      concatMap(builderConfig => architect.run(builderConfig, this.context))
    );
  }

  private killProcess(process: ChildProcess | null): void {
    if (!process) {
      return;
    }
    return treeKill(process.pid, 'SIGTERM', (error: any) => {
      this.tscProcess = null;
      if (error) {
        if (Array.isArray(error) && error[0] && error[2]) {
          const errorMessage = error[2];
          this.context.logger.error(errorMessage);
        } else if (error.message) {
          this.context.logger.error(error.message);
        }
      }
    });
  }
}
