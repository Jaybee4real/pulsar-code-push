package org.json;

import java.util.List;
import java.util.Map;

public class JSONArray {
    private final List<Object> values;

    @SuppressWarnings("unchecked")
    public JSONArray(String source) throws JSONException {
        this((List<Object>) JsonReader.parse(source, List.class));
    }

    JSONArray(List<Object> values) {
        this.values = values;
    }

    public int length() {
        return values.size();
    }

    public int getInt(int index) throws JSONException {
        if (!(values.get(index) instanceof Number)) throw new JSONException("JSONArray[" + index + "] is not a number");
        return ((Number) values.get(index)).intValue();
    }

    public String getString(int index) throws JSONException {
        if (!(values.get(index) instanceof String)) throw new JSONException("JSONArray[" + index + "] is not a string");
        return (String) values.get(index);
    }

    public String optString(int index) {
        Object value = index < values.size() ? values.get(index) : null;
        return value == null ? "" : String.valueOf(value);
    }

    @SuppressWarnings("unchecked")
    public JSONObject optJSONObject(int index) {
        Object value = index < values.size() ? values.get(index) : null;
        return value instanceof Map ? new JSONObject((Map<String, Object>) value) : null;
    }

    public JSONObject getJSONObject(int index) throws JSONException {
        JSONObject object = optJSONObject(index);
        if (object == null) throw new JSONException("JSONArray[" + index + "] is not a JSONObject");
        return object;
    }

    @SuppressWarnings("unchecked")
    public JSONArray getJSONArray(int index) throws JSONException {
        Object value = values.get(index);
        if (!(value instanceof List)) throw new JSONException("JSONArray[" + index + "] is not a JSONArray");
        return new JSONArray((List<Object>) value);
    }
}
