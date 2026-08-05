
export const ENV= {
    PORT: Number(process.env.PORT ?? 3001),
    MONGO_URI: process.env.MONGO_URI?? 'mongodb://localhost:27017',
    MONGO_DB  : process.env.MONGO_DB ?? 'las-vegas-discobar',
    MESA_HASH_SECRET :process.env.MESA_HASH_SECRET ?? 'vegas',
    JWT_SECRET: process.env.JWT_SECRET ?? 'secret_default',
    STAFF_SECRET : process.env.STAFF_SECRET ?? 'secret-mesero'
}