import newsApi from './api/news.js';
const { fetchNews } = newsApi;

async function test() {
    console.log('Testing api/news.js directly...');
    const req = {
        method: 'POST',
        body: { categories: ['technology'], countries: ['us'] }
    };
    const res = {
        setHeader: () => { },
        status: (code) => {
            console.log('Status:', code);
            return {
                json: (data) => console.log('Returned data:', JSON.stringify(data).substring(0, 500) + '...'),
                end: () => { }
            }
        }
    };
    await fetchNews(req, res);
    console.log('Fetch completed');
}

test();
