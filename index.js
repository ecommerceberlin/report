import dotenv from 'dotenv'
import { Octokit } from "@octokit/core";
import dayjs from 'dayjs'
import {Parser} from 'json2csv'
import fs from 'fs'
import sortBy from 'lodash/sortBy.js' 
import isEmpty from 'lodash/isEmpty.js'

dotenv.config()

const reporting_interval = 14; //days!

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

const dateFormat = "YYYY-MM-DD"
const friendlyDate = (str) => str? dayjs(str).format(dateFormat): ""
const curDate = dayjs().format(dateFormat);
const targetFolder = `reports/${curDate}`
const labelsToSkip = ["dependencies"]


/**
 * no user config below
 */

const commits = [];
const issues = [];
const stats = {
    commits: 0,
    issues_open: 0,
    issues_closed: 0,
    issues_touched: 0
}


const octokit = new Octokit({ auth: process.env.GITHUB_PERSONAL_TOKEN });


await Promise.all(repos.map(async (repo) => {
    
    const {data} = await octokit.request(
        `GET /repos/${repo}/commits`, { 
            since: dayjs().subtract(reporting_interval, 'day').toISOString(),
            per_page: 100,
        }
    );

    data.forEach(commit => commits.push({
            date: friendlyDate(commit.commit.author.date), 
            repo, 
            message: commit.commit.message.replace(/\r?\n|\r/gm, " ")
    }))

}));

stats.commits = commits.length;

await Promise.all(repos.map(async (repo) => {
    
    const {data} = await octokit.request(
        `GET /repos/${repo}/issues`, { 
            filter: "all",
            sort: "updated",
            per_page: 100,
            since: dayjs().subtract(reporting_interval, 'day').toISOString(),
            state: "all"
         }
    );

    data.forEach(issue => {

        if(!isEmpty(issue.labels) && labelsToSkip.includes(issue.labels[0].name)){
            return
        }

        issues.push({
            repo, 
            state: issue.state,
            creator: issue.user.login,
            assignees: issue.assignees.map(item=>item.login).join(", "),
            message: issue.title.replace(/\r?\n|\r/gm, " "),
            labels: issue.labels.map(item=>item.name).join(", "),
            created_at: friendlyDate(issue.created_at),
            updated_at: friendlyDate(issue.updated_at), 
            closed_at: friendlyDate(issue.closed_at),
            comments: issue.comments,
            milestone: "milestone" in issue && !isEmpty(issue.milestone)? issue.milestone.title: "",
            url: issue.html_url,
        })

        // console.log(issue)

        switch(issue.state){
            case "open":
                ++stats.issues_open
            break
            case "closed":
                ++stats.issues_closed
            break
        }

        if(dayjs(issue.updated_at).isAfter(dayjs(issue.created_at))){
            ++stats.issues_touched
        }
    })

}));


if (!fs.existsSync(targetFolder)){
    fs.mkdirSync(targetFolder, { recursive: true });
}

const sortedCommits = sortBy(commits, ["date"])

const csvCommits  = new Parser({fields: Object.keys(sortedCommits[0])}).parse(sortedCommits);

fs.writeFile(`${targetFolder}/commits.csv`, csvCommits, function(err) {
    if(err) {
        return console.log(err);
    }
    console.log("Commits report saved!");
}); 

const sortedIssues = sortBy(issues, ["state"])

const csvIssues  = new Parser({fields: Object.keys(issues[0]) }).parse(sortedIssues);

fs.writeFile(`${targetFolder}/issues.csv`, csvIssues, function(err) {
    if(err) {
        return console.log(err);
    }
    console.log("Issues report saved!");
}); 

fs.writeFile(`${targetFolder}/summary.json`, JSON.stringify(stats), function(err) {
    if(err) {
        return console.log(err);
    }
    console.log("Summary report saved!");
});