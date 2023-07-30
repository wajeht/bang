import axios from 'axios';
export async function getTitleOfAUrl(url: string) {
	// add no cors to the url
	const response = await axios.get(url, {
		headers: {
			'Access-Control-Allow-Origin': '*',
		},
	});

	// get the text from the response
	const text = await response.data;

	// get the title from the text
	const title = text.match(/<title[^>]*>([^<]+)<\/title>/)[1];

	console.log(title);
}
