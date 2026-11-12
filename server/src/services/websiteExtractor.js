
import * as cheerio from "cheerio";
import dns from "node:dns/promises";
import net from "node:net";
import ipaddr from "ipaddr.js";


function isPublicIp(address) {
    if (!ipaddr.isValid(address)) {
        return false;
    }

    return ipaddr.parse(address).range() === "unicast";
}


async function validateWebsiteUrl(value) {
    const url = new URL(value);

    if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("Only HTTP and HTTPS websites are allowed");
    }

    if (url.username || url.password) {
        throw new Error("Credentials in URLs are not allowed");
    }

    const hostname = url.hostname.toLowerCase();

    if (
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local")
    ) {
        throw new Error("Local websites are not allowed");
    }

    if (net.isIP(hostname)) {
        if (!isPublicIp(hostname)) {
            throw new Error("Private IP addresses are not allowed");
        }
    } else {
        const addresses = await dns.lookup(hostname, {
            all: true,
            verbatim: true
        });

        if (
            !addresses.length ||
            addresses.some((entry) => !isPublicIp(entry.address))
        ) {
            throw new Error("Restricted website address");
        }
    }

    return url;
}


function cleanText(value) {
    return (value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500);
}


export async function extractBusinessWebsite(website) {
    let currentUrl = await validateWebsiteUrl(website);

    let response;

    // Follow redirects manually and validate each destination.
    for (let attempt = 0; attempt < 4; attempt++) {
        response = await fetch(currentUrl, {
            redirect: "manual",
            signal: AbortSignal.timeout(10000),

            headers: {
                "User-Agent": "LeadFlowBusinessResearch/1.0",
                "Accept": "text/html"
            }
        });

        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const redirect = response.headers.get("location");

            if (!redirect) {
                throw new Error("Invalid website redirect");
            }

            currentUrl = await validateWebsiteUrl(
                new URL(redirect, currentUrl).toString()
            );

            continue;
        }

        break;
    }

    if (!response || !response.ok) {
        throw new Error("Could not access business website");
    }

    const contentType =
        response.headers.get("content-type") || "";

    if (!contentType.includes("text/html")) {
        throw new Error("Website did not return HTML");
    }

    const html = await response.text();

    if (Buffer.byteLength(html, "utf8") > 1024 * 1024) {
        throw new Error("Website page is too large");
    }

    const $ = cheerio.load(html);

    $("script, style, noscript, iframe, svg").remove();

    const title = cleanText($("title").first().text());

    const description = cleanText(
        $('meta[name="description"]').attr("content") ||
        $('meta[property="og:description"]').attr("content")
    );

    const pageText = $("body").text();

    const emailRegex =
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

    const emails = new Set(
        pageText.match(emailRegex) || []
    );

    $('a[href^="mailto:"]').each((_, element) => {
        const email = $(element)
            .attr("href")
            ?.replace(/^mailto:/i, "")
            .split("?")[0]
            .trim();

        if (email && emailRegex.test(email)) {
            emails.add(email);
        }

        emailRegex.lastIndex = 0;
    });

    const phones = new Set();

    $('a[href^="tel:"]').each((_, element) => {
        const phone = $(element)
            .attr("href")
            ?.replace(/^tel:/i, "")
            .trim();

        if (phone) {
            phones.add(phone);
        }
    });

    return {
        website: currentUrl.origin,
        title,
        description,
        emails: [...emails].slice(0, 10),
        phones: [...phones].slice(0, 10),
        extractedAt: new Date().toISOString(),
        extractionSource: "Business website"
    };
}
