package android.util;

public class Base64 {
    public static final int DEFAULT = 0;

    public static byte[] decode(String encoded, int flags) {
        return java.util.Base64.getDecoder().decode(encoded);
    }
}
