package com.microsoft.codepush.react;

import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.EOFException;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.crypto.Cipher;
import javax.crypto.NoSuchPaddingException;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public final class PulsarBundleDecryptor {

    public static final int SEALED_MAGIC = 0x504c5342;

    private static final int VERSION = 1;
    private static final int PREFIX_LENGTH = 9;
    private static final int MAX_HEADER_LENGTH = 16384;
    private static final int SEGMENT_SIZE = 65536;
    private static final int TAG_LENGTH = 16;
    private static final String ALGORITHM = "A256GCM-SEG64K";
    private static final Collection<String> KINDS = Arrays.asList("full", "diff", "manifest", "sourcemap");

    public static class DecryptionException extends Exception {
        public DecryptionException(String failureCause) {
            super(failureCause);
        }
    }

    private PulsarBundleDecryptor() {
    }

    public static Map<String, byte[]> parseBundleKeys(String keyString) {
        Map<String, byte[]> keys = new LinkedHashMap<>();
        if (keyString == null) return keys;
        for (String entry : keyString.split("[\\s,]+")) {
            String[] parts = entry.split(":", -1);
            if (parts.length != 2) continue;
            byte[] rawKey;
            try {
                rawKey = Base64.decode(parts[1], Base64.DEFAULT);
            } catch (IllegalArgumentException e) {
                continue;
            }
            if (rawKey.length == 32 && keyIdOf(rawKey).equals(parts[0])) {
                keys.put(parts[0], rawKey);
            }
        }
        return keys;
    }

    public static int readLeadingInt(File file) {
        byte[] leading = new byte[4];
        try (InputStream input = new FileInputStream(file)) {
            int offset = 0;
            while (offset < leading.length) {
                int count = input.read(leading, offset, leading.length - offset);
                if (count < 0) return 0;
                offset += count;
            }
        } catch (IOException e) {
            return 0;
        }
        return ByteBuffer.wrap(leading).getInt();
    }

    public static boolean isSealedFile(File file) {
        return readLeadingInt(file) == SEALED_MAGIC;
    }

    public static void decryptFile(File source, File destination, Map<String, byte[]> bundleKeys,
                                   String expectedPackageHash, Collection<String> allowedKinds) throws DecryptionException {
        destination.delete();
        try {
            decrypt(source, destination, bundleKeys, expectedPackageHash, allowedKinds);
        } catch (DecryptionException e) {
            destination.delete();
            throw e;
        }
    }

    private static void decrypt(File source, File destination, Map<String, byte[]> bundleKeys,
                                String expectedPackageHash, Collection<String> allowedKinds) throws DecryptionException {
        long fileSize = source.length();
        try (DataInputStream input = new DataInputStream(new BufferedInputStream(new FileInputStream(source), SEGMENT_SIZE))) {
            byte[] prefix = readExactly(input, PREFIX_LENGTH, "format");
            ByteBuffer prefixBuffer = ByteBuffer.wrap(prefix);
            if (prefixBuffer.getInt(0) != SEALED_MAGIC || prefix[4] != VERSION) throw new DecryptionException("format");
            long headerLength = prefixBuffer.getInt(5) & 0xffffffffL;
            if (headerLength < 1 || headerLength > MAX_HEADER_LENGTH || PREFIX_LENGTH + headerLength > fileSize) {
                throw new DecryptionException("format");
            }
            byte[] headerBytes = readExactly(input, (int) headerLength, "format");
            JSONObject header = parseHeader(headerBytes);
            String packageHash = header.optString("packageHash");
            String kind = header.optString("kind");

            if (expectedPackageHash != null && !expectedPackageHash.equals(packageHash)) {
                throw new DecryptionException("package-hash-mismatch");
            }
            if (!allowedKinds.contains(kind)) throw new DecryptionException("kind-mismatch");

            SecretKeySpec dataKey = unwrapDataKey(header, bundleKeys);
            byte[] additionalData = sha256(headerBytes);
            byte[] noncePrefix = Base64.decode(header.optString("nonce"), Base64.DEFAULT);

            long payloadLength = fileSize - PREFIX_LENGTH - headerLength;
            int stride = SEGMENT_SIZE + TAG_LENGTH;
            long remainder = payloadLength % stride;
            if (payloadLength < TAG_LENGTH || (remainder != 0 && remainder < TAG_LENGTH)) {
                throw new DecryptionException("truncated");
            }
            long segmentCount = Math.max(1, (payloadLength + stride - 1) / stride);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            byte[] segment = new byte[stride];
            try (OutputStream output = new BufferedOutputStream(new FileOutputStream(destination), SEGMENT_SIZE)) {
                for (long index = 0; index < segmentCount; index++) {
                    boolean isLast = index == segmentCount - 1;
                    int segmentLength = isLast ? (int) (payloadLength - index * stride) : stride;
                    try {
                        input.readFully(segment, 0, segmentLength);
                    } catch (EOFException e) {
                        throw new DecryptionException("truncated");
                    }
                    byte[] plaintext;
                    try {
                        cipher.init(Cipher.DECRYPT_MODE, dataKey, new GCMParameterSpec(TAG_LENGTH * 8, segmentNonce(noncePrefix, index, isLast)));
                        cipher.updateAAD(additionalData);
                        plaintext = cipher.doFinal(segment, 0, segmentLength);
                    } catch (GeneralSecurityException e) {
                        throw new DecryptionException("authentication");
                    }
                    output.write(plaintext);
                }
            }
        } catch (IOException e) {
            throw new DecryptionException("io");
        } catch (NoSuchAlgorithmException | NoSuchPaddingException e) {
            throw new DecryptionException("unsupported");
        }
    }

    private static JSONObject parseHeader(byte[] headerBytes) throws DecryptionException {
        try {
            JSONObject header = new JSONObject(new String(headerBytes, StandardCharsets.UTF_8));
            String kind = header.optString("kind");
            String appId = header.optString("appId");
            if (!ALGORITHM.equals(header.optString("alg"))
                    || !KINDS.contains(kind)
                    || appId.isEmpty() || appId.length() > 128
                    || !isHex(header.optString("packageHash"), 64)
                    || ("diff".equals(kind) && !isHex(header.optString("baseHash"), 64))
                    || decodedLength(header.optString("nonce")) != 7) {
                throw new DecryptionException("format");
            }
            JSONArray keyEntries = header.getJSONArray("keys");
            if (keyEntries.length() < 1 || keyEntries.length() > 16) throw new DecryptionException("format");
            for (int position = 0; position < keyEntries.length(); position++) {
                JSONObject entry = keyEntries.getJSONObject(position);
                if (!isHex(entry.optString("kid"), 16)
                        || decodedLength(entry.optString("iv")) != 12
                        || decodedLength(entry.optString("wrapped")) != 48) {
                    throw new DecryptionException("format");
                }
            }
            return header;
        } catch (JSONException err) {
            throw new DecryptionException("format");
        }
    }

    private static SecretKeySpec unwrapDataKey(JSONObject header, Map<String, byte[]> bundleKeys) throws DecryptionException {
        JSONArray keyEntries = header.optJSONArray("keys");
        for (int position = 0; position < keyEntries.length(); position++) {
            JSONObject entry = keyEntries.optJSONObject(position);
            String kid = entry.optString("kid");
            byte[] bundleKey = bundleKeys.get(kid);
            if (bundleKey == null) continue;
            String context = "pulsar-dek|v1|" + kid + "|" + header.optString("appId") + "|"
                    + header.optString("packageHash") + "|" + header.optString("kind");
            try {
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(bundleKey, "AES"),
                        new GCMParameterSpec(TAG_LENGTH * 8, Base64.decode(entry.optString("iv"), Base64.DEFAULT)));
                cipher.updateAAD(context.getBytes(StandardCharsets.UTF_8));
                byte[] rawDataKey = cipher.doFinal(Base64.decode(entry.optString("wrapped"), Base64.DEFAULT));
                if (rawDataKey.length != 32) throw new DecryptionException("unwrap");
                return new SecretKeySpec(rawDataKey, "AES");
            } catch (GeneralSecurityException e) {
                throw new DecryptionException("unwrap");
            }
        }
        throw new DecryptionException("no-matching-key");
    }

    private static byte[] segmentNonce(byte[] noncePrefix, long index, boolean isLast) {
        return ByteBuffer.allocate(12)
                .put(noncePrefix)
                .putInt((int) index)
                .put((byte) (isLast ? 1 : 0))
                .array();
    }

    private static byte[] readExactly(DataInputStream input, int length, String failureCause) throws IOException, DecryptionException {
        byte[] buffer = new byte[length];
        try {
            input.readFully(buffer);
        } catch (EOFException e) {
            throw new DecryptionException(failureCause);
        }
        return buffer;
    }

    private static int decodedLength(String encoded) {
        try {
            return Base64.decode(encoded, Base64.DEFAULT).length;
        } catch (IllegalArgumentException e) {
            return -1;
        }
    }

    private static boolean isHex(String text, int length) {
        return text.length() == length && text.matches("[0-9a-f]+");
    }

    private static String keyIdOf(byte[] rawKey) {
        byte[] digest = sha256(rawKey);
        StringBuilder keyId = new StringBuilder();
        for (int position = 0; position < 8; position++) {
            keyId.append(String.format("%02x", digest[position] & 0xff));
        }
        return keyId.toString();
    }

    private static byte[] sha256(byte[] bytes) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(bytes);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
