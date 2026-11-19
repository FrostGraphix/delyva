import { delyvaConfig } from '@delyva/config/eslint';

export default [...delyvaConfig({ tsconfigRootDir: import.meta.dirname }), { ignores: ['dist/**', 'types/**'] }];
