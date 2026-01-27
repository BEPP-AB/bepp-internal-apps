export interface SignatureData {
  name: string;
  title: string;
  email: string;
  phone: string;
  photoUrl: string;
}

// Generate SVG avatar placeholder
const generateAvatarPlaceholder = () => {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg width="140" height="140" xmlns="http://www.w3.org/2000/svg">
      <rect width="140" height="140" fill="#273d53" rx="70"/>
    </svg>`,
  )}`;
};

export function generateSignatureHtml(data: SignatureData): string {
  // Use placeholder if no photo URL, otherwise use provided URL or default
  const photoUrl = data.photoUrl ? data.photoUrl : generateAvatarPlaceholder();

  return `<table
  border="0"
  cellpadding="0"
  cellspacing="0"
  style="
    font-family: Arial;
    font-size: 16px;
    margin-left: 0;
    margin-right: auto;
    width: 440px;
  "
  width="100%"
>
  <tbody>
    <tr>
      <td>
        <div>
          <table
            border="0"
            cellpadding="0"
            cellspacing="0"
            style="
              font-size: 108%;
              margin-left: 0;
              margin-right: auto;
              width: auto;
            "
            width="100%"
          >
            <tbody>
              <tr>
                <td
                  style="
                    padding-right: 15px;
                    vertical-align: middle;
                    border-right: 2px solid #273d53;
                  "
                >
                    <img
                      src="${photoUrl}"
                      style="
                        display: block;
                        outline: 0;
                        border: none;
                        text-decoration: none;
                        object-fit: contain;
                        height: 140px;
                        width: 140px;
                        border-radius: 50%;
                      "
                    />
                </td>
                <td style="padding-left: 15px">
                  <h3
                    style="
                      font-size: 1em;
                      font-weight: 700;
                      line-height: 1.75;
                      margin: 0;
                      color: #273d53;
                    "
                  >
                    ${data.name}
                  </h3>
                  <p style="font-size: 0.8em; line-height: 1.5; margin: 0">
                    ${data.title}
                  </p>
                  <div style="margin-top: 8px"></div>
                  <table
                    border="0"
                    cellpadding="0"
                    cellspacing="0"
                    style="margin-left: 0; margin-right: auto; width: auto"
                    width="100%"
                  >
                    <tbody>
                      <tr>
                        <td>
                          <p
                            style="
                              font-size: 0.75em;
                              line-height: 1.6;
                              margin: 0;
                            "
                          >
                            <a
                              href="mailto:${data.email}"
                              style="color: #333; text-decoration: none"
                              >${data.email}</a
                            >
                          </p>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <table
                    border="0"
                    cellpadding="0"
                    cellspacing="0"
                    style="margin-left: 0; margin-right: auto; width: auto"
                    width="100%"
                  >
                    <tbody>
                      <tr>
                        <td>
                          <p
                            style="
                              font-size: 0.75em;
                              line-height: 1.6;
                              margin: 0;
                            "
                          >
                            <a
                              href="tel:${data.phone}"
                              style="color: #333; text-decoration: none"
                              >${data.phone}</a
                            >
                          </p>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <table
                    border="0"
                    cellpadding="0"
                    cellspacing="0"
                    style="margin-left: 0; margin-right: auto; width: auto"
                    width="100%"
                  >
                    <tbody>
                      <tr>
                        <td>
                          <p
                            style="
                              font-size: 0.75em;
                              line-height: 1.6;
                              margin: 0;
                            "
                          >
                            <a
                              href="https://www.bepp.se"
                              style="color: #333; text-decoration: none"
                              target="_blank"
                              >www.bepp.se</a
                            >
                          </p>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div style="margin-top: 8px">
                    <a
                      href="https://www.bepp.se"
                      target="_blank"
                      style="text-decoration: none"
                    >
                      <img
                        src="https://s6aizkvzvnhvjqhd.public.blob.vercel-storage.com/generic-assets/bepp-logo-navy-IeKJDzPiY53BAmbLIhkBaVT7dgjBS0.png"
                        style="
                          display: block;
                          outline: 0;
                          border: none;
                          text-decoration: none;
                          object-fit: contain;
                          height: 18px;
                        "
                      />
                    </a>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  </tbody>
</table>`;
}
