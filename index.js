import readline from "readline";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import axios from "axios";
import cssbeautify from "cssbeautify";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function getMiddlePartOfURL(url) {
  // Remove protocol if present
  let domain = url.replace(/^(https?:\/\/)?(www\.)?/, "");

  // Find the index of the first slash
  const slashIndex = domain.indexOf("/");

  // Extract the middle part
  const middlePart = slashIndex !== -1 ? domain.slice(0, slashIndex) : domain;

  return middlePart;
}

async function scrapeWebsite(url) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url, {
    waitUntil: "domcontentloaded",
  });
  // Wait for 5 seconds
  const html = await page.content();
  // Write HTML content to file
  const folderPath = "./data/";
  const fileName = getMiddlePartOfURL(url);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath);
  }
  fs.writeFileSync(folderPath + `${fileName}.html`, html);
  await browser.close();
}

async function checkWebsiteCookies(url) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url);

  // Retrieve the current page's cookies
  const cookies = await page.cookies();

  console.log("Website Cookies:");
  if (cookies.length > 0) {
    console.log(cookies);
  } else {
    console.log("No cookies found.");
  }

  await browser.close();
}

async function scanForLinks(url) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Navigate to the specified URL
  await page.goto(url);

  // Extract all the anchor elements and get the href attribute
  const hrefs = await page.$$eval("a", (links) =>
    links.map((link) => link.href)
  );

  // Filter out empty and invalid URLs
  const validURLs = hrefs.filter((href) => href && href !== "about:blank");

  // Print the extracted URLs
  console.log(validURLs);

  // Close the browser
  await browser.close();
}

async function getWebsiteCSS(url) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url);

  const css = await page.evaluate(async () => {
    const styleSheets = Array.from(document.styleSheets);

    let cssText = "";

    for (const styleSheet of styleSheets) {
      if (styleSheet.href) {
        // If the stylesheet is loaded from an external source
        const response = await fetch(styleSheet.href);
        const text = await response.text();
        cssText += text;
      } else {
        // If the stylesheet is embedded in the HTML document
        cssText += styleSheet.ownerNode.textContent;
      }
    }

    const elements = document.querySelectorAll("*");
    for (const element of elements) {
      const computedStyle = window.getComputedStyle(element);
      cssText += computedStyle.cssText;
    }

    return cssText;
  });
  const formattedCSS = cssbeautify(css, {
    indent: "  ", // Specify the desired indentation, e.g., two spaces
    autosemicolon: true, // Add missing semicolons
  });

  const folderPath = "./data/";
  const fileName = getMiddlePartOfURL(url);
  if (!folderPath) fs.mkdirSync(folderPath);
  fs.writeFileSync(folderPath + `${fileName}.css`, formattedCSS);
  console.log(formattedCSS);

  await browser.close();
}
async function searchGoogle(query) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(
    `https://www.google.com/search?q=${encodeURIComponent(query)}`
  );

  let hasNextPage = true;
  const results = [];

  while (hasNextPage) {
    await page.waitForSelector("#search");

    const pageResults = await page.evaluate(() => {
      const searchResults = Array.from(document.querySelectorAll(".g"));

      return searchResults.map((result) => {
        const titleElement = result.querySelector("h3");
        const linkElement = result.querySelector("a");
        const descriptionElement = result.querySelector(".st");

        return {
          title: titleElement ? titleElement.textContent : "",
          link: linkElement ? linkElement.href : "",
          description: descriptionElement ? descriptionElement.textContent : "",
        };
      });
    });

    results.push(...pageResults);

    const nextButton = await page.$("#pnnext");
    if (nextButton) {
      await Promise.all([page.waitForNavigation(), nextButton.click()]);
    } else {
      hasNextPage = false;
    }
  }
  const folderPath = "./data/";

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath);
  }

  const jsonOutput = JSON.stringify(results, null, 2);
  fs.writeFileSync(folderPath + "search-results.json", jsonOutput);
  await browser.close();

  console.log("Search results saved to search-results.json");
}

async function downloadImages(url) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url);

  const imageUrls = await page.evaluate(() => {
    // Get all image elements on the page
    const images = Array.from(document.querySelectorAll("img"));

    // Extract the image URLs
    return images.map((img) => img.src);
  });

  // Specify the directory path for storing the downloaded images
  const folderPath = "./data/images";

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  // Download each image
  for (const imageUrl of imageUrls) {
    const fileExtension = path.extname(imageUrl);
    if (fileExtension) {
      const imageFileName = path.basename(imageUrl);
      const imagePath = path.join(folderPath, imageFileName);
      try {
        const response = await axios.get(imageUrl, {
          responseType: "arraybuffer",
        });
        fs.writeFileSync(imagePath, response.data);
        console.log(`Downloaded: ${imageFileName}`);
      } catch (error) {
        console.error(`Failed to download: ${imageFileName}`, error);
      }
    } else {
      console.log(`Skipped file without extension: ${imageUrl}`);
    }
  }

  await browser.close();
}

rl.question(
  "What would you like to do?\n1. Perform actions on a website\n2. Search all Google pages for a term\nEnter your choice: ",
  async (choice) => {
    if (choice === "1") {
      rl.question("Enter a URL: ", async (url) => {
        console.log("What would you like to do?");
        console.log("1. Scrape the website");
        console.log("2. Check if website is using cookies");
        console.log("3. Get links on the website");
        console.log("4. Get website CSS");
        console.log("5. Get existing images");

        rl.question("Enter your choice: ", async (actionChoice) => {
          if (actionChoice === "1") {
            try {
              await scrapeWebsite(url);
            } catch (error) {
              console.error(
                "An error occurred while scraping the website:",
                error
              );
            }
          } else if (actionChoice === "2") {
            try {
              await checkWebsiteCookies(url);
            } catch (error) {
              console.error(error);
            }
          } else if (actionChoice === "3") {
            try {
              await scanForLinks(url);
            } catch (error) {
              console.error(error);
            }
          } else if (actionChoice === "4") {
            try {
              await getWebsiteCSS(url);
            } catch (error) {
              console.error(error);
            }
          } else if (actionChoice === "5") {
            try {
              await downloadImages(url);
            } catch (error) {
              console.error(error);
            }
          } else {
            console.log("Invalid choice. Exiting...");
          }

          rl.close();
          process.exit(0);
        });
      });
    } else if (choice === "2") {
      rl.question("Enter your search term: ", async (query) => {
        try {
          await searchGoogle(query);
        } catch (error) {
          console.error(error);
        }

        rl.close();
        process.exit(0);
      });
    } else {
      console.log("Invalid choice. Exiting...");
      rl.close();
      process.exit(0);
    }
  }
);
