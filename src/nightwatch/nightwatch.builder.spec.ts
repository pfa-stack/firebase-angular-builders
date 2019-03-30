import { normalize } from '@angular-devkit/core';
import { TestLogger } from '@angular-devkit/architect/testing';
import MultipleBuilderServe, {
  NightwatchBuilderOptions
} from './nightwatch.builder';

describe('Multiple Builder Build', () => {
  let builder: MultipleBuilderServe;
  let testOptions: NightwatchBuilderOptions;

  beforeEach(() => {
    builder = new MultipleBuilderServe({
      host: <any>{},
      logger: new TestLogger('test'),
      workspace: <any>{
        root: '/root'
      },
      architect: <any>{}
    });
    // testOptions = {
    //   name: 'Multiple Builder Build name'
    // };
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
