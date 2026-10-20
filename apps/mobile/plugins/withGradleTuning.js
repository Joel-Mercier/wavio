const { withGradleProperties } = require("expo/config-plugins");

const JVM_ARGS_KEY = "org.gradle.jvmargs";
const MAX_METASPACE_SIZE = "1024m";
const METASPACE_FLAG = /-XX:MaxMetaspaceSize=\S+/;

const PROPERTIES = {
  "org.gradle.caching": "true",
};

const setProperty = (properties, key, value) => {
  const entry = properties.find(
    (item) => item.type === "property" && item.key === key,
  );
  if (entry) {
    entry.value = value;
  } else {
    properties.push({ type: "property", key, value });
  }
};

const setMaxMetaspaceSize = (properties) => {
  const flag = `-XX:MaxMetaspaceSize=${MAX_METASPACE_SIZE}`;
  const entry = properties.find(
    (item) => item.type === "property" && item.key === JVM_ARGS_KEY,
  );
  if (!entry) {
    setProperty(properties, JVM_ARGS_KEY, `-Xmx2048m ${flag}`);
  } else if (METASPACE_FLAG.test(entry.value)) {
    entry.value = entry.value.replace(METASPACE_FLAG, flag);
  } else {
    entry.value = `${entry.value} ${flag}`;
  }
};

const withGradleTuning = (config) =>
  withGradleProperties(config, (cfg) => {
    setMaxMetaspaceSize(cfg.modResults);
    for (const [key, value] of Object.entries(PROPERTIES)) {
      setProperty(cfg.modResults, key, value);
    }
    return cfg;
  });

module.exports = withGradleTuning;
