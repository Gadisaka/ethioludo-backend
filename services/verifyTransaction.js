const axios = require("axios");

const API_KEY = "Ridofc3258SYFUHG8LG7ADEES2402T245MLQZHCA";
const BASE_URL = "https://ex.pro.et";

/**
 * Verify a transaction from Telebirr or CBE
 *
 * @param {"telebirr" | "cbe"} provider - The payment provider
 * @param {Object} payload - Transaction details
 * @param {string} payload.referenceId - Transaction reference ID
 * @param {string|number} payload.receivedAmount - Amount received
 * @param {string} payload.receiverName - Receiver's name
 * @param {string} payload.receiverAccountNumber - Phone number (telebirr) or bank account (cbe)
 * @param {string} [payload.payerAccountNumber] - Payer account (cbe) or phone (telebirr). For cbe, pass "none" if not available.
 *
 * @returns {Promise<Object>} - API response
 */
async function verifyTransaction(provider, payload) {
  try {
    if (!["telebirr", "cbe"].includes(provider)) {
      throw new Error("Provider must be 'telebirr' or 'cbe'");
    }

    const res = await axios.post(
      `${BASE_URL}/api/verify/${provider}`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.data;
  } catch (err) {
    return {
      success: false,
      message: err.response?.data?.message || err.message,
    };
  }
}

module.exports = { verifyTransaction };
