import { createBuilder } from '@angular-devkit/architect/src/index2';
import { handler } from './handler';

export default createBuilder(handler);
