import { normalize } from '@angular-devkit/core';
import { TestLogger } from '@angular-devkit/architect/testing';
import MultipleBuilderBuild, {
  MultipleBuilderBuildOptions
} from './multiple-build.builder';

describe('Multiple Builder Build', () => {
  let builder: MultipleBuilderBuild;
  let testOptions: MultipleBuilderBuildOptions;

  beforeEach(() => {
    builder = new MultipleBuilderBuild({
      host: <any>{},
      logger: new TestLogger('test'),
      workspace: <any>{
        root: '/root'
      },
      architect: <any>{}
    });
    testOptions = {
      name: 'Multiple Builder Build name'
    };
  });

  it('should work', async () => {
    const result = await builder.run({
      root: normalize('/root'),
      projectType: 'application',
      builder: 'my-project:multiple-builder-build',
      options: testOptions
    });

    expect(result).toBeTruthy();
  });
});
