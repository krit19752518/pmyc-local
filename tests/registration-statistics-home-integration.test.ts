import express from 'express';
import request from 'supertest';
import { publicRouter } from '../src/routes/public.router';
import { renderLayout } from '../src/layout';
it.each(['/', '/index.php'])('connects homepage %s markup to the shipped statistics client',async(url)=>{
  const app=express();app.use(publicRouter);
  const response=await request(app).get(url);
  expect(response.status).toBe(200);
  for(const id of ['title','summary','total','provinces','districts','gaps']) {
    expect(response.text.match(new RegExp('id="home-statistics-'+id+'"','g'))).toHaveLength(1);
  }
  expect(response.text).toMatch(/<script defer src="[^"]*assets\/registration-statistics\/home.js\?v=issue89-home-1"><\/script>/);
  expect(response.text).toContain('registration-statistics.php#stats?level=district&amp;status=zero');
  expect(response.text).not.toContain('ข้อมูล ณ');
});
it('loads the client only when the homepage has its markup',()=>{
  expect(renderLayout('home','plain','home','/')).not.toContain('registration-statistics/home.js');
  expect(renderLayout('rules','plain','rules','/')).not.toContain('registration-statistics/home.js');
});
