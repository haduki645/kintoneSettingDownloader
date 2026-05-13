import axios from "axios";

async function checkServer(baseUrl: string) {
  try {
    const res = await axios.get(`${baseUrl}/models`, { timeout: 2000 });
    console.log("Status:", res.status);
    console.log("Data:", JSON.stringify(res.data, null, 2));
    return true;
  } catch (err: any) {
    console.log("Error code:", err.code);
    console.log("Error message:", err.message);
    return false;
  }
}

const baseUrl = "http://localhost:1234/v1";
checkServer(baseUrl).then(isUp => {
  console.log("Is Up:", isUp);
});
