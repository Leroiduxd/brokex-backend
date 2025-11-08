const axios = require("axios");

class PullServiceClient {
  constructor(baseURL) {
    this.client = axios.create({ baseURL });
  }

  async getProof(request) {
    const response = await this.client.post("/get_proof", request);
    return response.data;
  }
}

module.exports = PullServiceClient;






