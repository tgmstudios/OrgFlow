export type SampleSource = {
  id: string;
  title: string;
  kind: string;
  label: string;
  paragraphs: { heading: string; text: string }[];
};

export const sources: SampleSource[] = [
  {
    id: "welcome",
    title: "Volunteer welcome notes",
    kind: "Sample Google Drive document",
    label: "Volunteer operations",
    paragraphs: [
      {
        heading: "Before the first shift",
        text: "Ask each new volunteer to complete the interest form and read the orientation sheet. Both links are in the welcome email. Add their name and availability to the weekly volunteer rota.",
      },
      {
        heading: "On Saturday morning",
        text: "New volunteers arrive at 8:30 a.m. for a food safety briefing, before the pantry opens at 9 a.m. Pair each new volunteer with someone who has worked a shift before.",
      },
      {
        heading: "After the shift",
        text: "Ask how the first shift went and confirm availability for the following week. Jo Garcia coordinates the weekly rota and answers scheduling questions.",
      },
    ],
  },
  {
    id: "handoff",
    title: "Miriam’s coordinator handoff",
    kind: "Sample uploaded text note",
    label: "Staff knowledge",
    paragraphs: [
      {
        heading: "What I always tell a new volunteer",
        text: "Send the welcome email before their first Saturday. It links to our interest form and orientation sheet. Tell them to arrive at 8:30 a.m. and wear closed shoes.",
      },
      {
        heading: "The small things that help",
        text: "Introduce them to their shift partner before the food safety briefing. At the end of the shift, check in and ask whether they would like to return the next week. Record their answer on the rota so Jo can plan ahead.",
      },
    ],
  },
  {
    id: "opening",
    title: "Saturday pantry opening",
    kind: "Published sample playbook",
    label: "Pantry operations",
    paragraphs: [
      {
        heading: "8:00 a.m. · Prepare the pantry",
        text: "The shift coordinator unlocks the pantry, checks the fridge temperature log and sets out the collection tables. Record any temperature concern and notify the pantry manager before using the food.",
      },
      {
        heading: "8:30 a.m. · Welcome the team",
        text: "Welcome new volunteers, introduce their shift partners and give the food safety briefing. Assign roles for check-in, packing and collection.",
      },
      {
        heading: "9:00 a.m. · Open for collection",
        text: "Open the front doors at 9 a.m. The check-in volunteer welcomes visitors while the packing team prepares food parcels.",
      },
    ],
  },
];

export const questions = [
  {
    question: "How do we welcome a new volunteer?",
    intro:
      "Start before their first Saturday. Here’s the welcome process in your pantry’s notes.",
    steps: [
      [
        "Send the welcome email",
        "Include the interest form and orientation sheet. Add their availability to the weekly rota.",
      ],
      [
        "Make the first shift feel familiar",
        "Ask them to arrive at 8:30 a.m. for a food safety briefing, then pair them with an experienced volunteer.",
      ],
      [
        "Check in before they leave",
        "Ask how it went and confirm whether they can return next week. Jo Garcia coordinates the rota.",
      ],
    ],
    sourceIds: ["welcome", "handoff"],
  },
  {
    question: "What happens before the pantry opens?",
    intro:
      "The Saturday opening playbook sets out the morning, from the first key in the door to the first visitor.",
    steps: [
      [
        "8:00 a.m. · Get the space ready",
        "The shift coordinator unlocks the pantry, checks the fridge temperature log and sets out collection tables.",
      ],
      [
        "8:30 a.m. · Bring the team together",
        "Welcome new volunteers, give the food safety briefing and assign roles for check-in, packing and collection.",
      ],
      [
        "9:00 a.m. · Welcome visitors",
        "Open the front doors. The check-in volunteer welcomes visitors while the packing team prepares food parcels.",
      ],
    ],
    sourceIds: ["opening"],
  },
  {
    question: "Who looks after the volunteer rota?",
    intro:
      "Jo Garcia coordinates the weekly rota and answers scheduling questions.",
    steps: [
      [
        "Keep availability in one place",
        "Add each new volunteer’s name and availability to the weekly rota.",
      ],
      [
        "Record next week’s plans",
        "At the end of a first shift, confirm whether the volunteer can return and record their answer for Jo.",
      ],
    ],
    sourceIds: ["welcome", "handoff"],
  },
];

export const initialSteps = [
  "Send the welcome email with the interest form and orientation sheet. Ask the volunteer to wear closed shoes.",
  "Add their name and availability to the weekly rota. Confirm arrival at 8:30 a.m. on their first Saturday.",
  "Introduce their shift partner and give the food safety briefing before the pantry opens at 9 a.m.",
  "Check in at the end of the shift. Record next week’s availability on the rota for Jo Garcia.",
];
