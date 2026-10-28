import crypto from 'crypto';

// Jest ya define NODE_ENV=test; se fija igual para que el .env local no lo pise (dotenv no sobrescribe).
process.env.NODE_ENV = 'test';

// Si no hay una clave pública en el entorno para pruebas, generamos una efímera
if (!process.env.JWT_PUBLIC_KEY) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
        },
    });
    process.env.JWT_PUBLIC_KEY = publicKey;
    globalThis.__TEST_JWT_PRIVATE_KEY__ = privateKey;
    globalThis.__TEST_JWT_PUBLIC_KEY__ = publicKey;
}
