import { HandlerContext } from "$fresh/server.ts";

interface RequestData {
  link?: string;
  slug?: string;
}

type Links = Array<{ link: string; slug: string }>;

export const handler = async (req: Request, _ctx: HandlerContext) => {
  const accessToken = Deno.env.get('GITHUB_TOKEN');
  const gistId = Deno.env.get('GIST_ID');
  const verification = Deno.env.get('VERIFICATION');
  let domain = Deno.env.get('DOMAIN');
  if (!accessToken || !gistId || !domain || !verification) {
    return new Response("Enviromental variables are not setup.", { status: 500 });
  }
  domain = domain.replace(/\/$/, '');
  const authorization = req.headers.get('Authorization');
  if (authorization !== verification) {
    return new Response("Unauthorized", { status: 401 });
  }

  const data = await req.json() as RequestData;
  let { link, slug } = data;

  const gistData = await (await fetch(`https://api.github.com/gists/${gistId}`, { headers: { Authorization: `token ${accessToken}` } })).json();
  const gistContent = JSON.parse(gistData.files['links.json'].content) as Links;

  try {
    switch (req.method) {
      case 'POST': {
        if (!link) {
          return new Response("Missing link", { status: 400 });
        }

        if (slug && gistContent.find((item) => item.slug === slug)) {
          return new Response("Slug is already taken", { status: 400 });
        }

        const existingLink = gistContent.find((item) => item.link === link);
        if (existingLink) {
          return new Response(`Link already exist\n${JSON.stringify(existingLink, null, 2)}`, { status: 400 });
        }

        slug = slug || Math.random().toString(36).substring(2, 5) + Math.random().toString(36).substring(2, 5);
        gistContent.push({ slug, link });
        await updateGist(accessToken, gistId, gistContent);

        return new Response(`${domain}/${slug}`);
      }
      case 'DELETE': {
        const existingLink = gistContent.find((item) => (item.slug === slug) || (item.link === link));
        if (!existingLink) {
          return new Response("Slug or link does not exist", { status: 400 });
        }

        gistContent.splice(gistContent.indexOf(existingLink), 1);
        await updateGist(accessToken, gistId, gistContent);

        return new Response("Deleted");
      }
      default:
        return new Response("Method not allowed", { status: 405 });
    }
  } catch (error) {
    return new Response(error.message, { status: 500 });
  }
};

async function updateGist(token: string, gistId: string, content: Array<{ link: string; slug: string }>) {
  await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: {
        'links.json': {
          content: JSON.stringify(content, null, 2),
        },
      },
    }),
  });
}
