import {nodeResolve} from '@rollup/plugin-node-resolve';

export default {
    input: 'js/main.js',
    output: {
        file: 'build/main.bundle.js',
        format: 'es',
        sourcemap: true,
    },
    plugins: [
        nodeResolve(),
    ],
};
