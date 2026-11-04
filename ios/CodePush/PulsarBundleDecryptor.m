#import "PulsarBundleDecryptor.h"
#import <CommonCrypto/CommonCrypto.h>

static const uint8_t PulsarMagic[4] = {0x50, 0x4c, 0x53, 0x42};
static const uint8_t PulsarVersion = 1;
static const NSUInteger PulsarPrefixLength = 9;
static const NSUInteger PulsarMaxHeaderLength = 16384;
static const NSUInteger PulsarSegmentSize = 65536;
static const NSUInteger PulsarTagLength = 16;
static NSString * const PulsarAlgorithm = @"A256GCM-SEG64K";

typedef struct {
    uint64_t high;
    uint64_t low;
} PulsarBlock;

static PulsarBlock PulsarBlockFromBytes(const uint8_t *bytes)
{
    PulsarBlock block = {0, 0};
    for (int position = 0; position < 8; position++) {
        block.high = (block.high << 8) | bytes[position];
        block.low = (block.low << 8) | bytes[position + 8];
    }
    return block;
}

static void PulsarBlockToBytes(PulsarBlock block, uint8_t *bytes)
{
    for (int position = 7; position >= 0; position--) {
        bytes[position] = (uint8_t)(block.high & 0xff);
        bytes[position + 8] = (uint8_t)(block.low & 0xff);
        block.high >>= 8;
        block.low >>= 8;
    }
}

static PulsarBlock PulsarMultiply(PulsarBlock factor, PulsarBlock hashKey)
{
    PulsarBlock product = {0, 0};
    PulsarBlock shifted = hashKey;
    for (int bit = 0; bit < 128; bit++) {
        uint64_t word = bit < 64 ? factor.high : factor.low;
        uint64_t mask = 0 - ((word >> (63 - (bit % 64))) & 1);
        product.high ^= shifted.high & mask;
        product.low ^= shifted.low & mask;
        uint64_t carry = 0 - (shifted.low & 1);
        shifted.low = (shifted.low >> 1) | (shifted.high << 63);
        shifted.high = (shifted.high >> 1) ^ (0xe100000000000000ULL & carry);
    }
    return product;
}

static PulsarBlock PulsarGhashUpdate(PulsarBlock state, PulsarBlock hashKey, const uint8_t *bytes, NSUInteger length)
{
    uint8_t padded[16];
    for (NSUInteger offset = 0; offset < length; offset += 16) {
        NSUInteger chunk = MIN(16, length - offset);
        memset(padded, 0, sizeof(padded));
        memcpy(padded, bytes + offset, chunk);
        PulsarBlock block = PulsarBlockFromBytes(padded);
        state.high ^= block.high;
        state.low ^= block.low;
        state = PulsarMultiply(state, hashKey);
    }
    return state;
}

static BOOL PulsarEncryptBlock(NSData *key, const uint8_t input[16], uint8_t output[16])
{
    size_t moved = 0;
    return CCCrypt(kCCEncrypt, kCCAlgorithmAES, kCCOptionECBMode, key.bytes, key.length, NULL, input, 16, output, 16, &moved) == kCCSuccess && moved == 16;
}

static NSData * _Nullable PulsarOpen(NSData *key, NSData *nonce, NSData *sealed, NSData *additionalData)
{
    if (key.length != 32 || nonce.length != 12 || sealed.length < PulsarTagLength) return nil;
    NSUInteger ciphertextLength = sealed.length - PulsarTagLength;
    const uint8_t *ciphertext = sealed.bytes;
    const uint8_t *tag = ciphertext + ciphertextLength;

    uint8_t zero[16] = {0};
    uint8_t hashKeyBytes[16];
    if (!PulsarEncryptBlock(key, zero, hashKeyBytes)) return nil;
    PulsarBlock hashKey = PulsarBlockFromBytes(hashKeyBytes);

    uint8_t counter[16];
    memcpy(counter, nonce.bytes, 12);
    counter[12] = 0;
    counter[13] = 0;
    counter[14] = 0;
    counter[15] = 1;
    uint8_t tagMask[16];
    if (!PulsarEncryptBlock(key, counter, tagMask)) return nil;

    PulsarBlock state = {0, 0};
    state = PulsarGhashUpdate(state, hashKey, additionalData.bytes, additionalData.length);
    state = PulsarGhashUpdate(state, hashKey, ciphertext, ciphertextLength);
    PulsarBlock lengths = {(uint64_t)additionalData.length * 8, (uint64_t)ciphertextLength * 8};
    state.high ^= lengths.high;
    state.low ^= lengths.low;
    state = PulsarMultiply(state, hashKey);
    uint8_t expectedTag[16];
    PulsarBlockToBytes(state, expectedTag);

    uint8_t difference = 0;
    for (int position = 0; position < 16; position++) difference |= (uint8_t)(expectedTag[position] ^ tagMask[position] ^ tag[position]);
    if (difference != 0) return nil;

    counter[15] = 2;
    NSMutableData *plaintext = [NSMutableData dataWithLength:ciphertextLength];
    if (ciphertextLength == 0) return plaintext;
    CCCryptorRef cryptor = NULL;
    if (CCCryptorCreateWithMode(kCCEncrypt, kCCModeCTR, kCCAlgorithmAES, ccNoPadding, counter, key.bytes, key.length, NULL, 0, 0, kCCModeOptionCTR_BE, &cryptor) != kCCSuccess) return nil;
    size_t moved = 0;
    CCCryptorStatus status = CCCryptorUpdate(cryptor, ciphertext, ciphertextLength, plaintext.mutableBytes, ciphertextLength, &moved);
    CCCryptorRelease(cryptor);
    if (status != kCCSuccess || moved != ciphertextLength) return nil;
    return plaintext;
}

static NSString *PulsarHex(const uint8_t *bytes, NSUInteger length)
{
    NSMutableString *hex = [NSMutableString stringWithCapacity:length * 2];
    for (NSUInteger position = 0; position < length; position++) [hex appendFormat:@"%02x", bytes[position]];
    return hex;
}

static NSData *PulsarSha256(NSData *data)
{
    NSMutableData *digest = [NSMutableData dataWithLength:CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(data.bytes, (CC_LONG)data.length, digest.mutableBytes);
    return digest;
}

static BOOL PulsarIsHex(id value, NSUInteger length)
{
    if (![value isKindOfClass:[NSString class]] || [(NSString *)value length] != length) return NO;
    NSCharacterSet *invalid = [[NSCharacterSet characterSetWithCharactersInString:@"0123456789abcdef"] invertedSet];
    return [(NSString *)value rangeOfCharacterFromSet:invalid].location == NSNotFound;
}

static NSData * _Nullable PulsarBase64(id value, NSUInteger length)
{
    if (![value isKindOfClass:[NSString class]]) return nil;
    NSData *decoded = [[NSData alloc] initWithBase64EncodedString:value options:0];
    return decoded.length == length ? decoded : nil;
}

@implementation PulsarBundleDecryptor

+ (NSString *)errorDomain
{
    return @"PulsarBundleDecryptor";
}

+ (NSError *)failure:(NSString *)cause
{
    return [NSError errorWithDomain:self.errorDomain code:1 userInfo:@{NSLocalizedDescriptionKey: cause}];
}

+ (NSDictionary<NSString *, NSData *> *)bundleKeysFromString:(NSString *)keyString
{
    NSMutableDictionary<NSString *, NSData *> *keys = [NSMutableDictionary dictionary];
    if (![keyString isKindOfClass:[NSString class]]) return keys;
    NSMutableCharacterSet *separators = [NSMutableCharacterSet characterSetWithCharactersInString:@","];
    [separators formUnionWithCharacterSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    for (NSString *entry in [keyString componentsSeparatedByCharactersInSet:separators]) {
        if (!entry.length) continue;
        NSArray<NSString *> *parts = [entry componentsSeparatedByString:@":"];
        if (parts.count != 2) continue;
        NSData *rawKey = PulsarBase64(parts[1], 32);
        if (!rawKey) continue;
        NSData *digest = PulsarSha256(rawKey);
        if (![PulsarHex(digest.bytes, 8) isEqualToString:parts[0]]) continue;
        keys[parts[0]] = rawKey;
    }
    return keys;
}

+ (BOOL)isSealedFileAtPath:(NSString *)path
{
    NSFileHandle *handle = [NSFileHandle fileHandleForReadingAtPath:path];
    if (!handle) return NO;
    NSData *leading = [handle readDataUpToLength:4 error:nil];
    [handle closeAndReturnError:nil];
    return leading.length == 4 && memcmp(leading.bytes, PulsarMagic, 4) == 0;
}

+ (BOOL)decryptFileAtPath:(NSString *)sourcePath
                   toPath:(NSString *)destinationPath
               bundleKeys:(NSDictionary<NSString *, NSData *> *)bundleKeys
      expectedPackageHash:(NSString *)expectedPackageHash
             allowedKinds:(NSArray<NSString *> *)allowedKinds
                    error:(NSError **)error
{
    NSFileManager *fileManager = [NSFileManager defaultManager];
    [fileManager removeItemAtPath:destinationPath error:nil];
    NSString *cause = [self decryptFrom:sourcePath to:destinationPath bundleKeys:bundleKeys expectedPackageHash:expectedPackageHash allowedKinds:allowedKinds];
    if (!cause) return YES;
    [fileManager removeItemAtPath:destinationPath error:nil];
    if (error) *error = [self failure:cause];
    return NO;
}

+ (NSData *)read:(NSFileHandle *)handle length:(NSUInteger)length
{
    if (length == 0) return [NSData data];
    NSError *readError = nil;
    NSData *chunk = [handle readDataUpToLength:length error:&readError];
    return readError ? nil : chunk;
}

+ (NSString *)decryptFrom:(NSString *)sourcePath
                       to:(NSString *)destinationPath
               bundleKeys:(NSDictionary<NSString *, NSData *> *)bundleKeys
      expectedPackageHash:(NSString *)expectedPackageHash
             allowedKinds:(NSArray<NSString *> *)allowedKinds
{
    NSDictionary *attributes = [[NSFileManager defaultManager] attributesOfItemAtPath:sourcePath error:nil];
    NSFileHandle *input = [NSFileHandle fileHandleForReadingAtPath:sourcePath];
    if (!attributes || !input) return @"io";
    NSUInteger fileSize = [attributes[NSFileSize] unsignedIntegerValue];
    @try {
        NSData *prefix = [self read:input length:PulsarPrefixLength];
        if (!prefix) return @"io";
        const uint8_t *prefixBytes = prefix.bytes;
        if (prefix.length != PulsarPrefixLength || memcmp(prefixBytes, PulsarMagic, 4) != 0 || prefixBytes[4] != PulsarVersion) return @"format";
        NSUInteger headerLength = ((NSUInteger)prefixBytes[5] << 24) | ((NSUInteger)prefixBytes[6] << 16) | ((NSUInteger)prefixBytes[7] << 8) | prefixBytes[8];
        if (headerLength < 1 || headerLength > PulsarMaxHeaderLength || PulsarPrefixLength + headerLength > fileSize) return @"format";
        NSData *headerBytes = [self read:input length:headerLength];
        if (!headerBytes) return @"io";
        if (headerBytes.length != headerLength) return @"format";

        id parsed = [NSJSONSerialization JSONObjectWithData:headerBytes options:0 error:nil];
        if (![parsed isKindOfClass:[NSDictionary class]]) return @"format";
        NSDictionary *header = parsed;
        NSString *kind = header[@"kind"];
        NSString *appId = header[@"appId"];
        NSString *packageHash = header[@"packageHash"];
        NSData *noncePrefix = PulsarBase64(header[@"nonce"], 7);
        NSArray *keyEntries = header[@"keys"];
        if (![header[@"alg"] isEqual:PulsarAlgorithm]
            || ![@[@"full", @"diff", @"manifest", @"sourcemap"] containsObject:kind]
            || ![appId isKindOfClass:[NSString class]] || appId.length == 0 || appId.length > 128
            || !PulsarIsHex(packageHash, 64)
            || !noncePrefix
            || ![keyEntries isKindOfClass:[NSArray class]] || keyEntries.count < 1 || keyEntries.count > 16) return @"format";
        if ([kind isEqualToString:@"diff"] && !PulsarIsHex(header[@"baseHash"], 64)) return @"format";
        for (id entry in keyEntries) {
            if (![entry isKindOfClass:[NSDictionary class]] || !PulsarIsHex(entry[@"kid"], 16) || !PulsarBase64(entry[@"iv"], 12) || !PulsarBase64(entry[@"wrapped"], 48)) return @"format";
        }

        if (expectedPackageHash && ![packageHash isEqualToString:expectedPackageHash]) return @"package-hash-mismatch";
        if (![allowedKinds containsObject:kind]) return @"kind-mismatch";

        NSMutableData *dataKey = nil;
        for (NSDictionary *entry in keyEntries) {
            NSData *bundleKey = bundleKeys[entry[@"kid"]];
            if (!bundleKey) continue;
            NSString *context = [NSString stringWithFormat:@"pulsar-dek|v1|%@|%@|%@|%@", entry[@"kid"], appId, packageHash, kind];
            NSData *opened = PulsarOpen(bundleKey, PulsarBase64(entry[@"iv"], 12), PulsarBase64(entry[@"wrapped"], 48), [context dataUsingEncoding:NSUTF8StringEncoding]);
            if (opened.length != 32) return @"unwrap";
            dataKey = [opened mutableCopy];
            break;
        }
        if (!dataKey) return @"no-matching-key";

        NSData *additionalData = PulsarSha256(headerBytes);
        NSUInteger payloadLength = fileSize - PulsarPrefixLength - headerLength;
        NSUInteger stride = PulsarSegmentSize + PulsarTagLength;
        NSUInteger remainder = payloadLength % stride;
        if (payloadLength < PulsarTagLength || (remainder != 0 && remainder < PulsarTagLength)) return @"truncated";
        NSUInteger segmentCount = MAX(1, (payloadLength + stride - 1) / stride);

        if (![[NSFileManager defaultManager] createFileAtPath:destinationPath contents:nil attributes:nil]) return @"io";
        NSFileHandle *output = [NSFileHandle fileHandleForWritingAtPath:destinationPath];
        if (!output) return @"io";
        NSString *result = nil;
        for (NSUInteger index = 0; index < segmentCount && !result; index++) {
            @autoreleasepool {
                BOOL isLast = index == segmentCount - 1;
                NSUInteger segmentLength = isLast ? payloadLength - index * stride : stride;
                NSData *segment = [self read:input length:segmentLength];
                if (!segment) { result = @"io"; break; }
                if (segment.length != segmentLength) { result = @"truncated"; break; }
                uint8_t nonce[12];
                memcpy(nonce, noncePrefix.bytes, 7);
                nonce[7] = (uint8_t)(index >> 24);
                nonce[8] = (uint8_t)(index >> 16);
                nonce[9] = (uint8_t)(index >> 8);
                nonce[10] = (uint8_t)index;
                nonce[11] = isLast ? 1 : 0;
                NSData *plaintext = PulsarOpen(dataKey, [NSData dataWithBytes:nonce length:12], segment, additionalData);
                if (!plaintext) { result = @"authentication"; break; }
                if (![output writeData:plaintext error:nil]) { result = @"io"; break; }
            }
        }
        [output closeAndReturnError:nil];
        memset(dataKey.mutableBytes, 0, dataKey.length);
        return result;
    } @catch (NSException *exception) {
        return @"io";
    } @finally {
        [input closeAndReturnError:nil];
    }
}

@end
