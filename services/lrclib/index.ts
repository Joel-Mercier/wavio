import axios from "axios";

const lrclibApiInstance = axios.create({
  baseURL: "https://lrclib.net",
  headers: {
    "Content-Type": "application/json",
    "Lrclib-Client": "wavio",
  },
});

export default lrclibApiInstance;
