#import <Foundation/Foundation.h>
#import <CommonCrypto/CommonCrypto.h>
#import "PulsarBundleDecryptor.h"

static NSUInteger passed = 0;
static NSUInteger failed = 0;

static void check(BOOL condition, NSString *message)
{
    if (condition) {
        passed++;
    } else {
        failed++;
        printf("FAIL %s\n", message.UTF8String);
    }
}

static NSString *hexDigest(NSData *data)
{
    uint8_t digest[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
    NSMutableString *hex = [NSMutableString string];
    for (int position = 0; position < CC_SHA256_DIGEST_LENGTH; position++) [hex appendFormat:@"%02x", digest[position]];
    return hex;
}

int main(int argc, const char *argv[])
{
    @autoreleasepool {
        NSString *vectorsPath = [NSString stringWithUTF8String:argv[1]];
        NSString *workDirectory = [NSString stringWithUTF8String:argv[2]];
        NSDictionary *vectors = [NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:vectorsPath] options:0 error:nil];
        NSArray<NSString *> *keyStrings = vectors[@"keys"];
        NSString *packageHash = vectors[@"packageHash"];
        NSDictionary *(^keysFor)(NSArray<NSNumber *> *) = ^NSDictionary *(NSArray<NSNumber *> *indexes) {
            NSMutableArray *selected = [NSMutableArray array];
            for (NSNumber *index in indexes) [selected addObject:keyStrings[index.integerValue]];
            return [PulsarBundleDecryptor bundleKeysFromString:[selected componentsJoinedByString:@","]];
        };
        NSString *(^writeSealed)(NSString *, NSString *) = ^NSString *(NSString *name, NSString *base64) {
            NSString *path = [workDirectory stringByAppendingPathComponent:[name stringByAppendingString:@".plsb"]];
            [[[NSData alloc] initWithBase64EncodedString:base64 options:0] writeToFile:path atomically:YES];
            return path;
        };
        NSString *(^causeOf)(NSError *) = ^NSString *(NSError *error) {
            return [error.domain isEqualToString:PulsarBundleDecryptor.errorDomain] ? error.localizedDescription : [NSString stringWithFormat:@"unexpected:%@", error];
        };
        NSArray *fullOrDiff = @[@"full", @"diff"];

        check([keysFor(@[@0, @1]) count] == 2, @"both vector keys parse");
        NSString *tamperedKid = [@"0000000000000000:" stringByAppendingString:[keyStrings[0] componentsSeparatedByString:@":"][1]];
        NSDictionary *mixed = [PulsarBundleDecryptor bundleKeysFromString:[NSString stringWithFormat:@"%@, %@", tamperedKid, keyStrings[1]]];
        check(mixed.count == 1 && mixed[[keyStrings[1] substringToIndex:16]] != nil, @"a kid that does not match its key is dropped");
        check([PulsarBundleDecryptor bundleKeysFromString:@"garbage,,  "].count == 0, @"malformed key strings are ignored");
        check([PulsarBundleDecryptor bundleKeysFromString:nil].count == 0, @"a missing key string is empty");

        for (NSDictionary *vector in vectors[@"vectors"]) {
            NSString *name = vector[@"name"];
            NSString *kind = vector[@"kind"];
            NSDictionary *plaintextInfo = vector[@"plaintext"];
            NSUInteger expectedLength = [plaintextInfo[@"length"] unsignedIntegerValue];
            NSString *sealedPath = writeSealed(name, vector[@"sealed"]);
            NSString *outputPath = [workDirectory stringByAppendingPathComponent:[name stringByAppendingString:@".out"]];
            NSError *error = nil;
            check([PulsarBundleDecryptor isSealedFileAtPath:sealedPath], [name stringByAppendingString:@": recognised as sealed"]);
            if ([PulsarBundleDecryptor decryptFileAtPath:sealedPath toPath:outputPath bundleKeys:keysFor(vector[@"keyIndexes"]) expectedPackageHash:packageHash allowedKinds:fullOrDiff error:&error]) {
                NSData *output = [NSData dataWithContentsOfFile:outputPath];
                BOOL patternMatches = YES;
                const uint8_t *bytes = output.bytes;
                for (NSUInteger position = 0; position < output.length; position++) {
                    if (bytes[position] != position % 251) {
                        patternMatches = NO;
                        break;
                    }
                }
                check(output.length == expectedLength, [NSString stringWithFormat:@"%@: length %lu == %lu", name, (unsigned long)output.length, (unsigned long)expectedLength]);
                check(patternMatches, [name stringByAppendingString:@": plaintext pattern"]);
                check([hexDigest(output) isEqualToString:plaintextInfo[@"sha256"]], [name stringByAppendingString:@": sha256"]);
            } else {
                check(NO, [NSString stringWithFormat:@"%@: decrypt failed %@", name, causeOf(error)]);
            }
            if ([vector[@"keyIndexes"] count] > 1) {
                BOOL opened = [PulsarBundleDecryptor decryptFileAtPath:sealedPath toPath:outputPath bundleKeys:keysFor(@[@1]) expectedPackageHash:packageHash allowedKinds:fullOrDiff error:&error];
                check(opened && [hexDigest([NSData dataWithContentsOfFile:outputPath]) isEqualToString:plaintextInfo[@"sha256"]], [name stringByAppendingString:@": opens with the second key alone"]);
            }
            BOOL wrongHash = [PulsarBundleDecryptor decryptFileAtPath:sealedPath toPath:outputPath bundleKeys:keysFor(@[@0, @1]) expectedPackageHash:[@"" stringByPaddingToLength:64 withString:@"0" startingAtIndex:0] allowedKinds:fullOrDiff error:&error];
            check(!wrongHash && [causeOf(error) isEqualToString:@"package-hash-mismatch"], [NSString stringWithFormat:@"%@: wrong package hash -> %@", name, causeOf(error)]);
            check(![[NSFileManager defaultManager] fileExistsAtPath:outputPath], [name stringByAppendingString:@": no output left after failure"]);
            BOOL wrongKind = [PulsarBundleDecryptor decryptFileAtPath:sealedPath toPath:outputPath bundleKeys:keysFor(@[@0, @1]) expectedPackageHash:packageHash allowedKinds:@[[kind isEqualToString:@"full"] ? @"diff" : @"full"] error:&error];
            check(!wrongKind && [causeOf(error) isEqualToString:@"kind-mismatch"], [NSString stringWithFormat:@"%@: wrong kind -> %@", name, causeOf(error)]);
        }

        for (NSDictionary *failure in vectors[@"failures"]) {
            NSString *name = failure[@"name"];
            NSString *sealedPath = writeSealed([@"failure-" stringByAppendingString:name], failure[@"sealed"]);
            NSString *outputPath = [workDirectory stringByAppendingPathComponent:[NSString stringWithFormat:@"failure-%@.out", name]];
            NSError *error = nil;
            BOOL accepted = [PulsarBundleDecryptor decryptFileAtPath:sealedPath toPath:outputPath bundleKeys:keysFor(failure[@"keyIndexes"]) expectedPackageHash:nil allowedKinds:fullOrDiff error:&error];
            check(!accepted && [causeOf(error) isEqualToString:failure[@"reason"]], [NSString stringWithFormat:@"failure %@: %@ == %@", name, causeOf(error), failure[@"reason"]]);
            check(![[NSFileManager defaultManager] fileExistsAtPath:outputPath], [NSString stringWithFormat:@"failure %@: no output left", name]);
        }

        printf("objective-c decryptor vectors: %lu passed, %lu failed\n", (unsigned long)passed, (unsigned long)failed);
        return failed == 0 ? 0 : 1;
    }
}
