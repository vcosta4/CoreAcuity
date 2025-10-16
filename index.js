const axios = require("axios");
const nodemailer = require("nodemailer");
const cron = require('node-cron');

require("dotenv").config();
const ACUITY_USER_ID = process.env.ACUITY_USER_ID;
const ACUITY_API_KEY = process.env.ACUITY_API_KEY;

// Basic Auth header
const auth = {
  username: ACUITY_USER_ID,
  password: ACUITY_API_KEY,
};

////////////////////////////////////////////////////////////////////////
// Helper to get current Friday's date in YYYY-MM-DD
function getCurrentFridayDate() {
  const now = new Date();
  const day = now.getDay();
  const diff = day <= 5 ? 5 - day : 12 - day; // 5 = Friday
  const friday = new Date(now.getTime() + diff * 24 * 60 * 60 * 1000);
  return friday.toISOString().split("T")[0];
}

// Helper to get last Friday's date in YYYY-MM-DD
function getLastFridayDate() {
  const now = new Date();
  const day = now.getDay();
  const diff = day >= 5 ? day - 5 : day + 2; // 5 = Friday
  const lastFriday = new Date(now.getTime() - diff * 24 * 60 * 60 * 1000);
  return lastFriday.toISOString().split("T")[0];
}
////////////////////////////////////////////////////////////////////////
// Function to fetch appointment types with their IDs
async function fetchAppointmentTypes() {
  try {
    const response = await axios.get(
      "https://acuityscheduling.com/api/v1/appointment-types",
      {
        auth,
      },
    );

    console.log("📋 Appointment Types:");
    response.data.forEach((type) => {
      console.log(`- ${type.name} (ID: ${type.id})`);
    });
  } catch (error) {
    console.error("❌ Error fetching appointment types:", error.message);
  }
}

// Function to fetch report data
async function fetchOpenGymData(date) {
  try {
    const response = await axios.get(
      "https://acuityscheduling.com/api/v1/appointments",
      {
        auth,
        params: {
          appointmentTypeID: 17048510,
          minDate: date,
          maxDate: date,
        },
      },
    );

    console.log(`📅 Appointments on ${date}:`);
    return response.data;
  } catch (error) {
    console.error("❌ Error fetching appointments:", error.message);
    return null;
  }
}

function filterReportColumns(data) {
  const desiredFields = ["Athlete's Name", "Gender", "If so, what team?"];

  const filtered = data.map((entry) => {
    const row = {};

    entry.forms?.forEach((form) => {
      form.values?.forEach((field) => {
        if (desiredFields.includes(field.name)) {
          row[field.name] = field.value || "";
        }
      });
    });

    // Ensure all desired fields are present
    desiredFields.forEach((field) => {
      if (!row[field]) row[field] = "";
    });

    // Capitalize Athlete's Name
    row["Athlete's Name"] = row["Athlete's Name"].toUpperCase();

    return row;
  });

  // Sort alphabetically by Athlete's Name
  filtered.sort((a, b) =>
    a["Athlete's Name"].localeCompare(b["Athlete's Name"]),
  );

  return filtered;
}
////////////////////////////////////////////////////////////////////////
// Function to convert reportData to HTML table
function generateHTMLTable(data) {
  if (!Array.isArray(data) || data.length === 0)
    return "<p>No data available.</p>";

  const headers = Object.keys(data[0]);
  const rows = data.map((row, index) => {
    const bgColor = index % 2 === 0 ? "#f0f0f0" : "#ffffff";
    return `<tr style="background-color:${bgColor}; color:#000;">
      ${headers.map((h) => `<td style="padding:4px;">${row[h] || ""}</td>`).join("")}
      <td style="width:100px; padding:4px;"></td>
    </tr>`;
  });

  return `
    <table border="1" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 12px; color: #000;">
      <thead>
        <tr style="font-weight: bold; background-color: #d0d0d0; color: #000;">
          ${headers.map((h) => `<th style="padding:4px;">${h}</th>`).join("")}
          <th style="width:100px; padding:4px;"></th>
        </tr>
      </thead>
      <tbody>
        ${rows.join("\n")}
      </tbody>
    </table>
  `;
}

// Function to send email
async function sendEmailWithReport(data, date) {
  const htmlTable = generateHTMLTable(data);

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // use TLS
    auth: {
      user: process.env.EMAIL_USER, // your Gmail address
      pass: process.env.ACUITY_EMAIL_PASSWORD, // your App Password
    },
  });

  const mailOptions = {
    from: `"Open Gym Reports" <${process.env.EMAIL_USER}>`,
    to: process.env.RECIPIENTS,
    subject: `Open Gym Report for ${date}`,
    html: `
      <h2>Open Gym Report for ${date}</h2>
      ${htmlTable}
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("📧 Email sent to vbarnes@corevball.com");
  } catch (error) {
    console.error("❌ Error sending email:", error.message);
  }
}
////////////////////////////////////////////////////////////////////////
// ⏰ Schedule to run every Friday at 7:30 PM EST
cron.schedule(
  "20 21 * * 3",
  async () => {
    const date = getLastFridayDate();
    console.log(`📅 Running Open Gym Report for ${date}`);
    const reportData = await fetchOpenGymData(date);
    const filteredReportData = filterReportColumns(reportData);
    await sendEmailWithReport(filteredReportData, date);
  },
  {
    timezone: "America/New_York",
  },
);

// Main execution block
// (async () => {
//   const date = getLastFridayDate();
//   console.log(`📅 Running Open Gym Report for ${date}`);
//   const reportData = await fetchOpenGymData(date);
//   filteredReportData = filterReportColumns(reportData);
//   await sendEmailWithReport(filteredReportData, date);
// })();

console.log("⏳ Cron job scheduled: Every Friday at 7:30 PM EST");
