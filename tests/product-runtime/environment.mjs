
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
if(!process.env.PROJECT_REVIEW_RUN||!process.env.PROJECT_ROOT)throw Error('Dot-source tools/project-env.ps1 with your own seat/run first');
export const run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN),repo=fs.realpathSync(process.env.PROJECT_ROOT);
if(!run.startsWith(repo+path.sep))throw Error('Test output run must be inside the repository');
export const base=fileURLToPath(new URL('../..',import.meta.url));
export const modulePath=path.resolve(process.env.PRODUCT_RUNTIME_MODULE??path.join(run,'work/module/arch-kernel.mjs'));
export const nativePath=path.resolve(process.env.PRODUCT_NATIVE_EXE??path.join(run,'work/rust-target/release/examples/product-runtime-probe'+(process.platform==='win32'?'.exe':'')));
