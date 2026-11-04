#import "CodePush.h"
#import <UIKit/UIKit.h>
#import "PulsarBundleDecryptor.h"

@implementation CodePushConfig {
    NSMutableDictionary *_configDictionary;
    NSDictionary<NSString *, NSData *> *_bundleKeys;
}

static CodePushConfig *_currentConfig;

static NSString * const AppVersionConfigKey = @"appVersion";
static NSString * const BuildVersionConfigKey = @"buildVersion";
static NSString * const ClientUniqueIDConfigKey = @"clientUniqueId";
static NSString * const DeploymentKeyConfigKey = @"deploymentKey";
static NSString * const ServerURLConfigKey = @"serverUrl";
static NSString * const PublicKeyKey = @"publicKey";
static NSString * const BundleKeyIdsConfigKey = @"bundleKeyIds";

+ (instancetype)current
{
    return _currentConfig;
}

+ (void)initialize
{
    if (self == [CodePushConfig class]) {
        _currentConfig = [[CodePushConfig alloc] init];
    }
}

- (instancetype)init
{
    self = [super init];
    NSDictionary *infoDictionary = [[NSBundle mainBundle] infoDictionary];

    NSString *appVersion = [infoDictionary objectForKey:@"CFBundleShortVersionString"];
    NSString *buildVersion = [infoDictionary objectForKey:(NSString *)kCFBundleVersionKey];
    NSString *deploymentKey = [infoDictionary objectForKey:@"CodePushDeploymentKey"];
    NSString *serverURL = [infoDictionary objectForKey:@"CodePushServerURL"] ?: [infoDictionary objectForKey:@"CodePushServerUrl"];
    NSString *publicKey = [infoDictionary objectForKey:@"CodePushPublicKey"];
    id bundleKeyString = [infoDictionary objectForKey:@"CodePushBundleKeys"];

    NSUserDefaults *userDefaults = [NSUserDefaults standardUserDefaults];
    NSString *clientUniqueId = [userDefaults stringForKey:ClientUniqueIDConfigKey];
    if (clientUniqueId == nil) {
        clientUniqueId = [[[UIDevice currentDevice] identifierForVendor] UUIDString];
        [userDefaults setObject:clientUniqueId forKey:ClientUniqueIDConfigKey];
        [userDefaults synchronize];
    }

    if (!serverURL) {
        serverURL = @"https://api.usepulsar.dev/";
    }

    _configDictionary = [NSMutableDictionary dictionary];

    if (appVersion) [_configDictionary setObject:appVersion forKey:AppVersionConfigKey];
    if (buildVersion) [_configDictionary setObject:buildVersion forKey:BuildVersionConfigKey];
    if (serverURL) [_configDictionary setObject:serverURL forKey:ServerURLConfigKey];
    if (clientUniqueId) [_configDictionary setObject:clientUniqueId forKey:ClientUniqueIDConfigKey];
    if (deploymentKey) [_configDictionary setObject:deploymentKey forKey:DeploymentKeyConfigKey];
    if (publicKey) [_configDictionary setObject:publicKey forKey:PublicKeyKey];

    _bundleKeys = [PulsarBundleDecryptor bundleKeysFromString:[bundleKeyString isKindOfClass:[NSString class]] ? bundleKeyString : nil];
    [_configDictionary setObject:[[_bundleKeys allKeys] sortedArrayUsingSelector:@selector(compare:)] forKey:BundleKeyIdsConfigKey];

    return self;
}

- (NSString *)appVersion
{
    return [_configDictionary objectForKey:AppVersionConfigKey];
}

- (NSString *)buildVersion
{
    return [_configDictionary objectForKey:BuildVersionConfigKey];
}

- (NSDictionary *)configuration
{
    return _configDictionary;
}

- (NSString *)deploymentKey
{
    return [_configDictionary objectForKey:DeploymentKeyConfigKey];
}

- (NSString *)serverURL
{
    return [_configDictionary objectForKey:ServerURLConfigKey];
}

- (NSString *)clientUniqueId
{
    return [_configDictionary objectForKey:ClientUniqueIDConfigKey];
}

- (NSString *)publicKey
{
    return [_configDictionary objectForKey:PublicKeyKey];
}

- (NSDictionary<NSString *, NSData *> *)bundleKeys
{
    return _bundleKeys;
}

- (void)setAppVersion:(NSString *)appVersion
{
    [_configDictionary setValue:appVersion forKey:AppVersionConfigKey];
}

- (void)setDeploymentKey:(NSString *)deploymentKey
{
    [_configDictionary setValue:deploymentKey forKey:DeploymentKeyConfigKey];
}

- (void)setServerURL:(NSString *)serverURL
{
    [_configDictionary setValue:serverURL forKey:ServerURLConfigKey];
}

//no setter for PublicKey, because it's need to be hard coded within Info.plist for safety

@end
