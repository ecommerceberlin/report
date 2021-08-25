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

const objectToMarkdown = (obj) => Object.keys(obj).map(key => `**${key}:** ${obj[key]}`).join("\n\n")
const clearNewlines = (str) => str.replace(/\r?\n|\r/gm, " ")
/**
 * no user config below
 */

const commits = [];
const issues = [];

const stats = {
    commits: 0,
    issues_single_open: 0,
    issues_single_closed: 0,
    issues_single_duration: 0,
    issues_touched: 0,
    issues_shared_open: 0,
    issues_shared_closed: 0,
    issues_shared_duration: 0,
    issues_bugs: 0
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
            message: clearNewlines(commit.commit.message)
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

        const duration = issue.closed_at? dayjs(issue.closed_at).diff(dayjs(issue.created_at), 'm'): 0;
        const labels = issue.labels.map(item=>item.name);
        const assignees = !isEmpty(issue.assignees)? issue.assignees.map(item=>item.login): []

        if(!isEmpty(issue.labels) && labelsToSkip.includes(issue.labels[0].name)){
            return
        }

        if(duration > 28655){
            return;
        }


        issues.push({
            repo, 
            state: issue.state,
            creator: issue.user.login,
            assignees: assignees.join(", "),
            message: clearNewlines(issue.title),
            labels: labels.join(", "),
            created_at: friendlyDate(issue.created_at),
            updated_at: friendlyDate(issue.updated_at), 
            closed_at: friendlyDate(issue.closed_at),
            comments: issue.comments || 0,
            milestone: "milestone" in issue && !isEmpty(issue.milestone)? issue.milestone.title: "",
            url: issue.html_url,
            duration
        })

        if(labels.includes("bug")){
            ++stats.issues_bugs
        }

        if(issue.state=="closed"){
            if(!isEmpty(issue.assignees) && issue.assignees.length>1){
                ++stats.issues_shared_closed
            }else{
                ++stats.issues_single_closed
            }
        }else{
            if(!isEmpty(issue.assignees) && issue.assignees.length>1){
                ++stats.issues_shared_open
            }else{
                ++stats.issues_single_open
            }
        }

        // if(dayjs(issue.updated_at).isAfter(dayjs(issue.created_at))){
        //     ++stats.issues_touched
        // }

        if(!isEmpty(issue.assignees)){
            if( issue.assignees.length>1 ){
                stats.issues_shared_duration = stats.issues_shared_duration + duration;
            }else{
                stats.issues_single_duration = stats.issues_single_duration + duration;
            }
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

/** 
 * duration per issue closed in HOURS
 * 
*/

if(stats.issues_shared_closed && stats.issues_shared_duration){
    stats.issues_shared_duration = Math.round(stats.issues_shared_duration/60/stats.issues_shared_closed);
}

if(stats.issues_single_closed && stats.issues_single_duration){
    stats.issues_single_duration = Math.round(stats.issues_single_duration/60/stats.issues_single_closed);
}

fs.writeFile(`${targetFolder}/summary.md`, objectToMarkdown(stats), function(err) {
    if(err) {
        return console.log(err);
    }
    console.log("Summary report saved!");
});