import dotenv from 'dotenv'
import { Octokit } from "@octokit/core";
import dayjs from 'dayjs'
import {Parser} from 'json2csv'
import fs from 'fs'
import sortBy from 'lodash/sortBy.js' 



dotenv.config()


const repos = [

    "ecommerceberlin/ecommerceberlin.com",
    "ecommerceberlin/site-components",
    "ecommerceberlin/admin",
    "ecommerceberlin/ecommercegermanyawards.com",
    "ecommerceberlin/ehandel.com.pl",
    "ecommerceberlin/targiehandlu.pl",
    "az/eventjuicer-api",
    "eventjuicer/services"
]


const octokit = new Octokit({ auth: process.env.GITHUB_PERSONAL_TOKEN });
const rows = [];


await Promise.all(repos.map(async (repo) => {
    
    const {data} = await octokit.request(
        `GET /repos/${repo}/commits`, { since: dayjs().subtract(14, 'day').toISOString() }
    );

    data.forEach(commit => {
        rows.push({
            date: dayjs(commit.commit.author.date).format("YYYY-MM-DD"), 
            repo, 
            message: commit.commit.message.replace(/\r?\n|\r/gm, " ")
        })
    })


}));

const sorted = sortBy(rows, ["date"])

const csv  = new Parser({fields: ["repo", "date", "message"]}).parse(sorted);

fs.writeFile(`reports/report_${dayjs().format("YYYYMMDD")}.csv`, csv, function(err) {
    if(err) {
        return console.log(err);
    }
    console.log("The file was saved!");
}); 
