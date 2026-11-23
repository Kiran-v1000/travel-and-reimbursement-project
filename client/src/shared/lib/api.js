import axios from 'axios';

/** Single HTTP client for the whole app. Session lives in an httpOnly cookie. */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  timeout: 20000,
});

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    const body = error.response?.data?.error;
    if (status === 401 && !error.config?.url?.startsWith('/auth/')) onUnauthorized();
    const err = new Error(body?.message || (error.code === 'ECONNABORTED' ? 'The server took too long to respond' : 'Network error - please try again'));
    err.status = status;
    err.code = body?.code;
    err.fields = body?.fields;
    err.details = body?.details;
    return Promise.reject(err);
  },
);

export const get = (url, params) => api.get(url, { params }).then((r) => r.data);
export const post = (url, body) => api.post(url, body).then((r) => r.data);
export const put = (url, body) => api.put(url, body).then((r) => r.data);
export const patch = (url, body) => api.patch(url, body).then((r) => r.data);
export const del = (url) => api.delete(url).then((r) => r.data);

/** Download a CSV (keeps cookies, respects server-side permissions). */
export async function download(url, params, filename) {
  const res = await api.get(url, { params, responseType: 'blob' });
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export const fileUrl = (id) => `${api.defaults.baseURL}/attachments/${id}`;
