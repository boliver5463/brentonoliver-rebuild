# Contact form Lambda

Emails contact form submissions to `boliver5463@gmail.com` (overridable) via
**Amazon SES**.

**CAPTCHA is optional.** If the `TURNSTILE_SECRET` env var is unset (the current
default), the form works with no challenge. Set that env var — and re-add the
widget in `_includes/contact.html` — to turn on Cloudflare Turnstile verification
later, with no code change. Sections 1 and the Turnstile parts below only apply
once you decide to enable it.

- Runtime: **Node.js 20.x**
- Invoked via a **Lambda Function URL** (POST, CORS)
- No dependencies to bundle — `@aws-sdk/client-sesv2` ships with the runtime and
  `fetch` is a Node 18+ global. Just upload `index.mjs`.

The front-end lives in `_includes/contact.html`; the Function URL and Turnstile
**site** key are set in `_config.yml` under `contact_form:`.

---

## 1. Cloudflare Turnstile

1. Cloudflare dashboard → **Turnstile** → **Add site**.
2. Add your domain(s), including `localhost` / `127.0.0.1` for local testing.
3. Copy the **Site key** and **Secret key**.
   - Site key → `_config.yml` → `contact_form.turnstile_site_key` (public).
   - Secret key → Lambda env var `TURNSTILE_SECRET` (keep private).

## 2. Amazon SES

1. SES console → **Verified identities** → verify a **sender** (a domain you own,
   or a single email address). This address becomes `SES_FROM`.
2. If your account is still in the **SES sandbox**, you must also verify the
   **recipient** (`boliver5463@gmail.com`), or request production access to send
   to any address.
3. Note the AWS **region** — the Lambda must run in (or target) the same region.

## 3. Create the Lambda

```bash
cd lambda/contact-form
zip -r function.zip index.mjs package.json

aws lambda create-function \
  --function-name contact-form \
  --runtime nodejs20.x \
  --handler index.handler \
  --zip-file fileb://function.zip \
  --role arn:aws:iam::<ACCOUNT_ID>:role/<LAMBDA_EXEC_ROLE> \
  --timeout 15
```

To update later: `aws lambda update-function-code --function-name contact-form --zip-file fileb://function.zip`

### Environment variables

| Name               | Required | Example                          |
| ------------------ | -------- | -------------------------------- |
| `SES_FROM`         | yes      | `no-reply@yourdomain.com`        |
| `TO_EMAIL`         | no       | `boliver5463@gmail.com` (default)|
| `ALLOWED_ORIGIN`   | no       | `https://yourdomain.com` (default `*`) |
| `TURNSTILE_SECRET` | no       | unset = no CAPTCHA; set it to enable Turnstile |

```bash
aws lambda update-function-configuration \
  --function-name contact-form \
  --environment "Variables={TURNSTILE_SECRET=xxx,SES_FROM=no-reply@yourdomain.com,TO_EMAIL=boliver5463@gmail.com,ALLOWED_ORIGIN=https://yourdomain.com}"
```

### IAM permission

The execution role needs permission to send email. Attach an inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ses:SendEmail"],
      "Resource": "*"
    }
  ]
}
```

(Plus the standard `AWSLambdaBasicExecutionRole` for CloudWatch logs.)

## 4. Function URL

```bash
aws lambda create-function-url-config \
  --function-name contact-form \
  --auth-type NONE \
  --cors '{"AllowOrigins":["https://yourdomain.com"],"AllowMethods":["POST"],"AllowHeaders":["content-type"]}'

# allow public invoke of the URL
aws lambda add-permission \
  --function-name contact-form \
  --statement-id FunctionURLAllowPublicAccess \
  --action lambda:InvokeFunctionUrl \
  --principal "*" \
  --function-url-auth-type NONE
```

Copy the returned **FunctionUrl** into `_config.yml` → `contact_form.endpoint`.

> The handler also returns CORS headers itself (honouring `ALLOWED_ORIGIN`), so it
> works whether or not you configure CORS on the Function URL. For local testing,
> set `ALLOWED_ORIGIN=*` (or leave it unset) and add `localhost` to Turnstile.

## 5. Wire up the site

In `_config.yml`:

```yaml
contact_form:
  endpoint: "https://<id>.lambda-url.<region>.on.aws/"
  turnstile_site_key: "0x4AAAAAAA..."
```

Rebuild the Jekyll site and submit the form on the home page (`#contact`).

## Request / response contract

Request body (JSON):

```json
{ "name": "Ada", "email": "ada@example.com", "message": "Hello", "token": "<turnstile-token>" }
```

Responses: `200 {"ok":true}` on success; otherwise `4xx/5xx` with
`{"error":"<message>"}` which the front-end shows to the user.
