import {
  BuilderHandlerFn,
  BuilderOutput
} from '@angular-devkit/architect/src/api';
import { JsonObject } from '@angular-devkit/core';
import { of } from 'rxjs';

interface Options extends JsonObject {
  name: string;
}

export const builder: BuilderHandlerFn<Options> = (input, context) => {
  context.logger.debug(input.name);

  const output: BuilderOutput = {
    success: true
  };

  return of(output);
};
