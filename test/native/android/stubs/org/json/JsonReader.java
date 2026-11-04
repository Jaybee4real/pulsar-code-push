package org.json;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class JsonReader {
    private final String text;
    private int position;

    JsonReader(String text) {
        this.text = text;
    }

    static Object parse(String source, Class<?> expected) throws JSONException {
        try {
            JsonReader reader = new JsonReader(source);
            Object value = reader.read();
            reader.skipWhitespace();
            if (reader.position != source.length() || !expected.isInstance(value)) throw new JSONException("Unexpected JSON shape");
            return value;
        } catch (RuntimeException err) {
            throw new JSONException("Malformed JSON: " + err.getMessage());
        }
    }

    Object read() {
        skipWhitespace();
        char current = text.charAt(position);
        if (current == '{') return readObject();
        if (current == '[') return readArray();
        if (current == '"') return readString();
        if (text.startsWith("true", position)) { position += 4; return Boolean.TRUE; }
        if (text.startsWith("false", position)) { position += 5; return Boolean.FALSE; }
        if (text.startsWith("null", position)) { position += 4; return null; }
        return readNumber();
    }

    private Map<String, Object> readObject() {
        Map<String, Object> values = new LinkedHashMap<>();
        position++;
        skipWhitespace();
        if (text.charAt(position) == '}') { position++; return values; }
        while (true) {
            skipWhitespace();
            String name = readString();
            skipWhitespace();
            position++;
            values.put(name, read());
            skipWhitespace();
            if (text.charAt(position++) == '}') return values;
        }
    }

    private List<Object> readArray() {
        List<Object> values = new ArrayList<>();
        position++;
        skipWhitespace();
        if (text.charAt(position) == ']') { position++; return values; }
        while (true) {
            values.add(read());
            skipWhitespace();
            if (text.charAt(position++) == ']') return values;
        }
    }

    private String readString() {
        StringBuilder builder = new StringBuilder();
        position++;
        while (true) {
            char current = text.charAt(position++);
            if (current == '"') return builder.toString();
            if (current == '\\') {
                char escaped = text.charAt(position++);
                switch (escaped) {
                    case 'n': builder.append('\n'); break;
                    case 't': builder.append('\t'); break;
                    case 'r': builder.append('\r'); break;
                    case 'b': builder.append('\b'); break;
                    case 'f': builder.append('\f'); break;
                    case 'u': builder.append((char) Integer.parseInt(text.substring(position, position + 4), 16)); position += 4; break;
                    default: builder.append(escaped);
                }
            } else {
                builder.append(current);
            }
        }
    }

    private Number readNumber() {
        int start = position;
        while (position < text.length() && "+-0123456789.eE".indexOf(text.charAt(position)) >= 0) position++;
        String literal = text.substring(start, position);
        if (literal.contains(".") || literal.contains("e") || literal.contains("E")) return Double.parseDouble(literal);
        return Long.parseLong(literal);
    }

    private void skipWhitespace() {
        while (position < text.length() && Character.isWhitespace(text.charAt(position))) position++;
    }
}
