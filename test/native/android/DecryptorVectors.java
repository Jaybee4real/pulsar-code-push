import com.microsoft.codepush.react.PulsarBundleDecryptor;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Map;

public class DecryptorVectors {
    private static int passed = 0;
    private static final List<String> failures = new ArrayList<>();
    private static JSONArray keyStrings;

    private static void check(boolean condition, String message) {
        if (condition) {
            passed++;
        } else {
            failures.add(message);
            System.out.println("FAIL " + message);
        }
    }

    private static Map<String, byte[]> keys(JSONArray indexes) throws Exception {
        List<String> selected = new ArrayList<>();
        for (int position = 0; position < indexes.length(); position++) {
            selected.add(keyStrings.getString(indexes.getInt(position)));
        }
        return PulsarBundleDecryptor.parseBundleKeys(String.join(",", selected));
    }

    private static String sha256Hex(byte[] bytes) throws Exception {
        StringBuilder hex = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) hex.append(String.format("%02x", value & 0xff));
        return hex.toString();
    }

    public static void main(String[] args) throws Exception {
        JSONObject vectors = new JSONObject(new String(Files.readAllBytes(new File(args[0]).toPath()), StandardCharsets.UTF_8));
        File workDirectory = new File(args[1]);
        keyStrings = vectors.getJSONArray("keys");
        String packageHash = vectors.getString("packageHash");
        List<String> fullOrDiff = Arrays.asList("full", "diff");

        check(keys(new JSONArray("[0,1]")).size() == 2, "both vector keys parse");
        String tampered = "0000000000000000:" + keyStrings.getString(0).split(":")[1];
        Map<String, byte[]> filtered = PulsarBundleDecryptor.parseBundleKeys(tampered + ", " + keyStrings.getString(1));
        check(filtered.size() == 1 && filtered.containsKey(keyStrings.getString(1).substring(0, 16)), "a kid that does not match its key is dropped");
        check(PulsarBundleDecryptor.parseBundleKeys("garbage,,  ").isEmpty(), "malformed key strings are ignored");
        check(PulsarBundleDecryptor.parseBundleKeys(null).isEmpty(), "a missing key string is empty");

        JSONArray vectorList = vectors.getJSONArray("vectors");
        for (int position = 0; position < vectorList.length(); position++) {
            JSONObject vector = vectorList.getJSONObject(position);
            String name = vector.getString("name");
            String kind = vector.getString("kind");
            JSONObject plaintextInfo = vector.getJSONObject("plaintext");
            File sealed = new File(workDirectory, name + ".plsb");
            File output = new File(workDirectory, name + ".out");
            Files.write(sealed.toPath(), Base64.getDecoder().decode(vector.getString("sealed")));
            check(PulsarBundleDecryptor.isSealedFile(sealed), name + ": recognised as sealed");
            try {
                PulsarBundleDecryptor.decryptFile(sealed, output, keys(vector.getJSONArray("keyIndexes")), packageHash, fullOrDiff);
                byte[] plaintext = Files.readAllBytes(output.toPath());
                boolean patternMatches = true;
                for (int index = 0; index < plaintext.length; index++) {
                    if ((plaintext[index] & 0xff) != index % 251) patternMatches = false;
                }
                check(plaintext.length == plaintextInfo.getInt("length"), name + ": length " + plaintext.length);
                check(patternMatches, name + ": plaintext pattern");
                check(sha256Hex(plaintext).equals(plaintextInfo.getString("sha256")), name + ": sha256");
            } catch (PulsarBundleDecryptor.DecryptionException e) {
                check(false, name + ": decrypt threw " + e.getMessage());
            }
            if (vector.getJSONArray("keyIndexes").length() > 1) {
                try {
                    PulsarBundleDecryptor.decryptFile(sealed, output, keys(new JSONArray("[1]")), packageHash, fullOrDiff);
                    check(sha256Hex(Files.readAllBytes(output.toPath())).equals(plaintextInfo.getString("sha256")), name + ": opens with the second key alone");
                } catch (PulsarBundleDecryptor.DecryptionException e) {
                    check(false, name + ": second key threw " + e.getMessage());
                }
            }
            try {
                PulsarBundleDecryptor.decryptFile(sealed, output, keys(new JSONArray("[0,1]")), new String(new char[64]).replace('\0', '0'), fullOrDiff);
                check(false, name + ": wrong package hash accepted");
            } catch (PulsarBundleDecryptor.DecryptionException e) {
                check("package-hash-mismatch".equals(e.getMessage()), name + ": wrong package hash -> " + e.getMessage());
                check(!output.exists(), name + ": no output left after failure");
            }
            try {
                PulsarBundleDecryptor.decryptFile(sealed, output, keys(new JSONArray("[0,1]")), packageHash, Arrays.asList(kind.equals("full") ? "diff" : "full"));
                check(false, name + ": wrong kind accepted");
            } catch (PulsarBundleDecryptor.DecryptionException e) {
                check("kind-mismatch".equals(e.getMessage()), name + ": wrong kind -> " + e.getMessage());
            }
        }

        JSONArray failureList = vectors.getJSONArray("failures");
        for (int position = 0; position < failureList.length(); position++) {
            JSONObject failure = failureList.getJSONObject(position);
            String name = failure.getString("name");
            File sealed = new File(workDirectory, "failure-" + name + ".plsb");
            File output = new File(workDirectory, "failure-" + name + ".out");
            Files.write(sealed.toPath(), Base64.getDecoder().decode(failure.getString("sealed")));
            try {
                PulsarBundleDecryptor.decryptFile(sealed, output, keys(failure.getJSONArray("keyIndexes")), null, fullOrDiff);
                check(false, "failure " + name + ": was accepted");
            } catch (PulsarBundleDecryptor.DecryptionException e) {
                check(failure.getString("reason").equals(e.getMessage()), "failure " + name + ": " + e.getMessage() + " == " + failure.getString("reason"));
                check(!output.exists(), "failure " + name + ": no output left");
            }
        }

        System.out.println("java decryptor vectors: " + passed + " passed, " + failures.size() + " failed");
        System.exit(failures.isEmpty() ? 0 : 1);
    }
}
