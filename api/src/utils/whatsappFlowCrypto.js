const crypto = require('crypto');

class FlowEndpointError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const AES_ALGORITHM = 'aes-128-gcm';
const AUTH_TAG_LENGTH = 16;

/**
 * Decrypts a WhatsApp Flow data-exchange request body.
 * Meta wraps the AES key with our RSA public key (OAEP/SHA-256) and encrypts
 * the JSON payload with that AES key (AES-128-GCM, tag appended to ciphertext).
 */
function decryptFlowRequest(body, privateKeyPem, passphrase) {
  const { encrypted_flow_data: encryptedFlowData, encrypted_aes_key: encryptedAesKey, initial_vector: initialVector } = body;
  if (!encryptedFlowData || !encryptedAesKey || !initialVector) {
    throw new FlowEndpointError(400, 'Missing encrypted_flow_data, encrypted_aes_key, or initial_vector');
  }

  let aesKey;
  try {
    const privateKey = crypto.createPrivateKey({ key: privateKeyPem, passphrase: passphrase || undefined });
    aesKey = crypto.privateDecrypt(
      { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(encryptedAesKey, 'base64')
    );
  } catch (err) {
    throw new FlowEndpointError(421, 'Failed to decrypt the request. Verify the private key matches the public key registered with Meta.');
  }

  const flowDataBuffer = Buffer.from(encryptedFlowData, 'base64');
  const ivBuffer = Buffer.from(initialVector, 'base64');
  const ciphertext = flowDataBuffer.subarray(0, -AUTH_TAG_LENGTH);
  const authTag = flowDataBuffer.subarray(-AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(AES_ALGORITHM, aesKey, ivBuffer);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');

  return { decryptedBody: JSON.parse(decrypted), aesKey, ivBuffer };
}

/** Encrypts the response with the same AES key, IV bit-flipped per the Flows spec. */
function encryptFlowResponse(responseObj, aesKey, ivBuffer) {
  const flippedIv = Buffer.from(ivBuffer.map((byte) => ~byte));
  const cipher = crypto.createCipheriv(AES_ALGORITHM, aesKey, flippedIv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(responseObj), 'utf-8'),
    cipher.final(),
    cipher.getAuthTag()
  ]);
  return encrypted.toString('base64');
}

/** Verifies Meta's X-Hub-Signature-256 header over the raw request body. */
function verifyFlowSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret) return false;
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const provided = signatureHeader.slice('sha256='.length);

  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(provided, 'hex');
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

module.exports = { FlowEndpointError, decryptFlowRequest, encryptFlowResponse, verifyFlowSignature };
