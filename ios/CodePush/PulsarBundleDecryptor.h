#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface PulsarBundleDecryptor : NSObject

@property (class, nonatomic, readonly) NSString *errorDomain;

+ (NSDictionary<NSString *, NSData *> *)bundleKeysFromString:(nullable NSString *)keyString;
+ (BOOL)isSealedFileAtPath:(NSString *)path;
+ (BOOL)decryptFileAtPath:(NSString *)sourcePath
                   toPath:(NSString *)destinationPath
               bundleKeys:(NSDictionary<NSString *, NSData *> *)bundleKeys
      expectedPackageHash:(nullable NSString *)expectedPackageHash
             allowedKinds:(NSArray<NSString *> *)allowedKinds
                    error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
