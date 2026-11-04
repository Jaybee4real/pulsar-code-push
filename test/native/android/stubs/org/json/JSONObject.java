package org.json;

import java.util.List;
import java.util.Map;

public class JSONObject {
    private final Map<String, Object> values;

    @SuppressWarnings("unchecked")
    public JSONObject(String source) throws JSONException {
        this((Map<String, Object>) JsonReader.parse(source, Map.class));
    }

    JSONObject(Map<String, Object> values) {
        this.values = values;
    }

    public boolean has(String name) {
        return values.containsKey(name);
    }

    public String optString(String name) {
        return optString(name, "");
    }

    public String optString(String name, String fallback) {
        Object value = values.get(name);
        return value == null ? fallback : String.valueOf(value);
    }

    public String getString(String name) throws JSONException {
        if (!(values.get(name) instanceof String)) throw new JSONException("JSONObject[" + name + "] is not a string");
        return (String) values.get(name);
    }

    public int getInt(String name) throws JSONException {
        if (!(values.get(name) instanceof Number)) throw new JSONException("JSONObject[" + name + "] is not a number");
        return ((Number) values.get(name)).intValue();
    }

    @SuppressWarnings("unchecked")
    public JSONArray optJSONArray(String name) {
        Object value = values.get(name);
        return value instanceof List ? new JSONArray((List<Object>) value) : null;
    }

    public JSONArray getJSONArray(String name) throws JSONException {
        JSONArray array = optJSONArray(name);
        if (array == null) throw new JSONException("JSONObject[" + name + "] is not a JSONArray");
        return array;
    }

    @SuppressWarnings("unchecked")
    public JSONObject optJSONObject(String name) {
        Object value = values.get(name);
        return value instanceof Map ? new JSONObject((Map<String, Object>) value) : null;
    }

    public JSONObject getJSONObject(String name) throws JSONException {
        JSONObject object = optJSONObject(name);
        if (object == null) throw new JSONException("JSONObject[" + name + "] is not a JSONObject");
        return object;
    }
}
