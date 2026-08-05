// src/patch-v8.ts
import v8 from 'node:v8';

// Si el objeto startupSnapshot no está completo en Bun, lo parchamos
if (v8) {
  const v8Any = v8 as any;
  if (!v8Any.startupSnapshot) {
    v8Any.startupSnapshot = {
      isBuildingSnapshot: () => false,
    };
  } else if (typeof v8Any.startupSnapshot.isBuildingSnapshot !== 'function') {
    v8Any.startupSnapshot.isBuildingSnapshot = () => false;
  }
}

if (typeof process !== 'undefined' && (process as any).getBuiltinModule) {
  const orig = (process as any).getBuiltinModule.bind(process);
  (process as any).getBuiltinModule = (id: string) => {
    if (id === 'v8') {
      const mod = orig('v8') || {};
      return {
        ...mod,
        startupSnapshot: {
          isBuildingSnapshot: () => false,
        },
      };
    }
    return orig(id);
  };
}