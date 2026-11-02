import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {uninstalledOptionals} from './uninstalled-optionals.ts';

describe('uninstalledOptionals', () => {
  it('lists optional dependencies that npm did not install', () => {
    const tree = {
      dependencies: {
        esbuild: {
          path: '/app/node_modules/esbuild',
          optionalDependencies: {'@esbuild/linux-x64': '0.25.0', '@esbuild/win32-x64': '0.25.0'},
          dependencies: {
            '@esbuild/linux-x64': {path: '/app/node_modules/@esbuild/linux-x64'},
            '@esbuild/win32-x64': {}
          }
        }
      }
    };

    assert.deepEqual(uninstalledOptionals(tree), ['@esbuild/win32-x64']);
  });

  it('keeps optional dependencies that are installed elsewhere in the tree', () => {
    const tree = {
      dependencies: {
        components: {
          path: '/app/node_modules/components',
          optionalDependencies: {'ngx-clipboard': '^19'},
          dependencies: {'ngx-clipboard': {}}
        },
        'ngx-clipboard': {path: '/app/node_modules/ngx-clipboard'}
      }
    };

    assert.deepEqual(uninstalledOptionals(tree), []);
  });

  it('leaves missing regular dependencies for licensed to report', () => {
    const tree = {
      dependencies: {
        app: {path: '/app/node_modules/app', dependencies: {broken: {}}}
      }
    };

    assert.deepEqual(uninstalledOptionals(tree), []);
  });
});
