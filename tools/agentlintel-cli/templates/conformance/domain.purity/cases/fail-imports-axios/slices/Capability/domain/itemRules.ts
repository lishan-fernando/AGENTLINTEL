import axios from 'axios'

export async function fetchItemMeta(referenceCode: string) {
  return axios.get(`https://example.invalid/api/items?ref=${referenceCode}`)
}
