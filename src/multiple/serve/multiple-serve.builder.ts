import {
  BuildEvent,
  Builder,
  BuilderConfiguration,
  BuilderContext
} from '@angular-devkit/architect';
import { Observable } from 'rxjs';
import { resolve, tags } from '@angular-devkit/core';

export interface MultipleBuilderServeOptions {
  name: string;
}

export default class MultipleBuilderServe
  implements Builder<MultipleBuilderServeOptions> {
  constructor(public context: BuilderContext) {}

  public run(
    builderConfig: BuilderConfiguration<MultipleBuilderServeOptions>
  ): Observable<BuildEvent> {
    const options = builderConfig.options;
    const root = this.context.workspace.root;
    const projectRoot = resolve(root, builderConfig.root);

    return new Observable(_ => {
      this.context.logger.info(tags.oneLine`
        **
        Multiple builder serve example. You chose the name ${options.name}.
        Project information:
        * Workspace Root: ${root}
        * Project root: ${projectRoot}
      `);
    });
  }
}
